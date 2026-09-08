import { AppError } from '@/libs/error/error';
import { AuthErrorCode, TimeoutErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { capabilitiesCoverPubchiWrite } from '@/libs/pubchi/capabilities';
import {
  deleteDeviceKey,
  getCurrentDeviceKey,
  getDeviceKeys,
  listDeviceKeysNotOwnedBy,
  loadOrGenerateDeviceKey,
  wipeDeviceKeysNotOwnedBy,
} from '@/libs/pubchi/device-key';
import { extractPubchiErrorCode, pubchiValidationError } from '@/libs/pubchi/errors';
import { isPubchiEnabled, isPubchiPanelEnabled, pubchiEndpointFor } from '@/libs/pubchi/flags';
import { PUBCHI_QUESTION_MAX_LENGTH } from '@/libs/pubchi/limits';
import {
  parsePendingEntry,
  type PendingDelegationDelete,
  readPendingDelegationDeletes,
  rememberPendingDelegationDeletes,
  rememberPendingDelegationDeletesPreservingOwner,
  replacePendingDelegationDeletesForOwner,
} from '@/libs/pubchi/pending-delegation-deletes';
import {
  bodySha256,
  delegationUri,
  isPubkyId,
  ownerBindingUri,
  parseFeedProposalV1,
  parseOwnerBindingV1,
  parseQueryResultV1,
  REQUEST_TTL_SECONDS,
  signDeviceDelegationV1,
  signRequestObjectV1,
  type UnsignedDeviceDelegationV1,
  type UnsignedRequestObjectV1,
} from '@/libs/pubchi/schemas';
import { bindingRecordId } from '@/models/pubchi/binding.schema';
import { toast } from '@/molecules/Toaster/toast';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPubchiBindingService } from '@/services/local/pubchi/binding';
import { PubchiService } from '@/services/pubchi/pubchi';
import { useAuthStore } from '@/stores/auth/auth.store';
import type {
  PubchiAskBody,
  PubchiBindingRecordResult,
  PubchiBindingWriteParams,
  PubchiQueryApplicationParams,
  PubchiQuerySuccess,
} from './pubchi.types';

export const PUBCHI_DELEGATION_DELETE_TIMEOUT_MS = 4_000;

type UnpublishOptions = {
  attemptRemote: boolean;
  includeLocalKeys?: boolean;
};

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              // Expected multi-tab contention: keep Timeout category for isDrainTimeout
              // without Err.timeout's error-level log + Sentry capture.
              new AppError({
                category: ErrorCategory.Timeout,
                code: TimeoutErrorCode.REQUEST_TIMEOUT,
                message,
                service: ErrorService.Pubchi,
                operation: 'unpublishKnownDelegations',
              }),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class PubchiApplication {
  private constructor() {}

  static async getActiveBinding(owner: string): Promise<PubchiBindingRecordResult | undefined> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'getActiveBinding',
      });
    }
    return LocalPubchiBindingService.readActive(owner);
  }

  static async commitCreateBinding(params: PubchiBindingWriteParams): Promise<PubchiBindingRecordResult> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'commitCreateBinding',
      });
    }

    assertPubchiCapability(params.owner);
    const now = Math.floor(Date.now() / 1000);
    const device = await loadTrustedDeviceKey(params.owner, now);
    const existing = await LocalPubchiBindingService.read(params.owner, params.bot);
    const createdAt = existing?.created_at ?? now;
    const candidate = {
      schema: 'pubchi-owner-binding' as const,
      version: 1 as const,
      owner: params.owner,
      bot: params.bot,
      status: 'active' as const,
      created_at: createdAt,
      updated_at: now,
    };
    const parsed = parseOwnerBindingV1(candidate);
    if (!parsed.ok) throw pubchiValidationError(parsed.code, 'commitCreateBinding');

    const record = { ...parsed.value, id: bindingRecordId(params.owner, params.bot) };
    await LocalPubchiBindingService.upsert(record);

    try {
      const delegation: UnsignedDeviceDelegationV1 = {
        schema: 'pubchi-device-delegation',
        version: 1,
        owner: params.owner,
        signer: device.signer,
        bot: params.bot,
        purposes: ['who-tagged-me', 'build-feed', 'what-i-missed', 'summarize'],
        created_at: device.created_at,
        expires_at: device.expires_at,
      };
      await HomeserverService.request({
        method: HttpMethod.PUT,
        url: delegationUri(params.owner, device.signer),
        bodyJson: await signDeviceDelegationV1(delegation, device.key),
      });
      await HomeserverService.request({
        method: HttpMethod.PUT,
        url: ownerBindingUri(params.owner, params.bot),
        bodyJson: parsed.value,
      });
    } catch (error) {
      await rollbackBindingWrite(params, existing);
      await HomeserverService.request({
        method: HttpMethod.DELETE,
        url: delegationUri(params.owner, device.signer),
      }).catch(() => undefined);
      await deleteDeviceKey(params.owner, device.signer).catch(() => undefined);
      throw error;
    }

    return parsed.value;
  }

  static async commitDeleteBinding(params: PubchiBindingWriteParams): Promise<void> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'commitDeleteBinding',
      });
    }

    const existing = await LocalPubchiBindingService.read(params.owner, params.bot);
    const now = Math.floor(Date.now() / 1000);
    const revoked = {
      schema: 'pubchi-owner-binding' as const,
      version: 1 as const,
      owner: params.owner,
      bot: params.bot,
      status: 'revoked' as const,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    const parsed = parseOwnerBindingV1(revoked);
    if (!parsed.ok) throw pubchiValidationError(parsed.code, 'commitDeleteBinding');

    await LocalPubchiBindingService.upsert({ ...parsed.value, id: bindingRecordId(params.owner, params.bot) });
    try {
      await HomeserverService.request({
        method: HttpMethod.DELETE,
        url: ownerBindingUri(params.owner, params.bot),
      });
      await LocalPubchiBindingService.delete(params.owner, params.bot);
    } catch (error) {
      await rollbackBindingWrite(params, existing);
      throw error;
    }
  }

  /**
   * Record known device delegations and, when `attemptRemote` is true, DELETE
   * each `delegationUri` while the session still covers write on `/pub/pubchi.app/`.
   *
   * Does NOT delete the owner binding at `/pub/pubchi.app/bots/<bot>.json`.
   * That object is the account-level U→B enrollment; logout revokes this
   * browser's device key, not the bot binding. "Remove bot" is the unenroll path.
   *
   * Never throws: a homeserver failure is recorded in localStorage so the next
   * session of the same owner can finish the DELETE. A previous identity's
   * remote delegation cannot be revoked without that identity's live session.
   *
   * When `includeLocalKeys` is false (sign-in / reconcile drains), a stored
   * record that names a currently-live local device key is skipped (no DELETE)
   * but retained. Logout keeps the default `includeLocalKeys: true` so the
   * live device is revoked.
   */
  static async unpublishKnownDelegations(
    owner: string | undefined,
    options: UnpublishOptions = { attemptRemote: true },
  ): Promise<{ failed: PendingDelegationDelete[] }> {
    try {
      if (!owner) return { failed: [] };

      const includeLocalKeys = options.includeLocalKeys !== false;
      const listed = includeLocalKeys ? await listKnownDelegations(owner) : { kind: 'ok' as const, items: [] };
      if (listed.kind === 'defer') {
        Logger.warn('Pubchi device-key read timed out; deferring pending drain', { owner });
        return { failed: ownerPending(owner) };
      }
      const known = listed.items;
      if (known.length) rememberPendingDelegationDeletes(known);

      const liveLookup = await liveDeviceSigners(owner);
      if (!liveLookup.ok && (liveLookup.defer || !includeLocalKeys)) {
        Logger.warn('Pubchi live-device lookup failed; deferring pending drain', { owner });
        return { failed: ownerPending(owner) };
      }
      const liveSigners = liveLookup.ok ? liveLookup.signers : new Set<string>();
      const skippedLive: PendingDelegationDelete[] = [];
      const toDeleteByKey = new Map<string, PendingDelegationDelete>();
      for (const item of [...ownerPending(owner), ...known]) {
        const parsed = parsePendingEntry(item);
        if (!parsed) continue;
        if (!includeLocalKeys && liveSigners.has(parsed.signer)) {
          skippedLive.push(parsed);
          continue;
        }
        toDeleteByKey.set(`${parsed.owner}:${parsed.signer}`, parsed);
      }
      const toDelete = [...toDeleteByKey.values()];
      if (!options.attemptRemote) {
        return { failed: dedupePending([...skippedLive, ...toDelete]) };
      }
      if (!sessionCanWritePubchi(owner)) {
        const retained = dedupePending([...skippedLive, ...toDelete]);
        replacePendingDelegationDeletesForOwner(owner, retained);
        return { failed: retained };
      }

      const retryable: PendingDelegationDelete[] = [];
      const authTerminal: PendingDelegationDelete[] = [];
      const results = await Promise.allSettled(
        toDelete.map((item) =>
          withTimeout(
            deleteDelegationRecord(item),
            PUBCHI_DELEGATION_DELETE_TIMEOUT_MS,
            'Pubchi delegation DELETE timed out',
          ),
        ),
      );
      results.forEach((result, index) => {
        const item = toDelete[index];
        if (!item) return;
        if (result.status === 'fulfilled') return;
        const error = result.reason;
        if (isAuthDenied(error)) {
          authTerminal.push(item);
          return;
        }
        Logger.warn('Pubchi delegation DELETE failed; logout continues', {
          owner: item.owner,
          signer: item.signer,
          error,
        });
        retryable.push(item);
      });
      const retained = dedupePending([...skippedLive, ...authTerminal, ...retryable]);
      replacePendingDelegationDeletesForOwner(owner, retained);
      if (retryable.length) {
        toast({
          variant: 'warning',
          title:
            'Pubchi device access could not be revoked on the homeserver. It will be retried the next time you sign in.',
          dismissButton: true,
        });
      }
      return { failed: retained };
    } catch (error) {
      Logger.warn('Pubchi unpublish threw; sign-out continues', { error });
      return { failed: owner ? ownerPending(owner) : [] };
    }
  }

  /**
   * Reconcile the Dexie binding with the homeserver object at
   * `pubky://<owner>/pub/pubchi.app/bots/<B>.json`. Revoke the local row only
   * on explicit 404/absence or a parsed body with `status !== 'active'`.
   * A malformed 200 or a parsed body whose `owner`/`bot` do not match the
   * requested binding is treated as transient — the local row is kept.
   */
  static async reconcileActiveBinding(owner: string): Promise<PubchiBindingRecordResult | undefined> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'reconcileActiveBinding',
      });
    }

    await wipeLocalStateFromOtherIdentities(owner);
    await PubchiApplication.unpublishKnownDelegations(owner, { attemptRemote: true, includeLocalKeys: false });

    const local = await LocalPubchiBindingService.readActive(owner);
    if (!local) return undefined;

    const uri = ownerBindingUri(owner, local.bot);
    let present: boolean;
    try {
      present = await HomeserverService.exists(uri);
    } catch {
      return local;
    }

    if (!present) {
      await markBindingRevoked(local);
      return undefined;
    }

    try {
      const remote = await HomeserverService.request({ method: HttpMethod.GET, url: uri });
      const parsed = parseOwnerBindingV1(remote);
      if (!parsed.ok) {
        return local;
      }
      if (parsed.value.status !== 'active') {
        await markBindingRevoked(local);
        return undefined;
      }
      if (parsed.value.bot !== local.bot || parsed.value.owner !== owner) {
        return local;
      }
      const record = { ...parsed.value, id: bindingRecordId(owner, parsed.value.bot) };
      await LocalPubchiBindingService.upsert(record);
      return parsed.value;
    } catch {
      return local;
    }
  }

  static async query(params: PubchiQueryApplicationParams): Promise<PubchiQuerySuccess> {
    if (!isPubchiPanelEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'query',
      });
    }

    const binding = await LocalPubchiBindingService.readActive(params.owner);
    if (!binding || binding.status !== 'active') {
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'BOT_MISMATCH', {
        service: ErrorService.Pubchi,
        operation: 'query',
      });
    }
    assertPubchiCapability(params.owner);

    const question = params.question.trim();
    if (!question) {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'REQUEST_MALFORMED', {
        service: ErrorService.Pubchi,
        operation: 'query',
      });
    }
    if (question.length > PUBCHI_QUESTION_MAX_LENGTH) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'REQUEST_MALFORMED', {
        service: ErrorService.Pubchi,
        operation: 'query',
      });
    }

    const purpose = params.purpose;
    if (!pubchiEndpointFor(purpose)) {
      throw pubchiValidationError('PURPOSE_UNSUPPORTED', 'query');
    }

    const body: PubchiAskBody = { question };
    const issuedAt = params.nowSeconds ?? Math.floor(Date.now() / 1000);
    const unsigned: UnsignedRequestObjectV1 = {
      schema: 'pubchi-request-object',
      version: 1,
      asker: params.owner,
      bot: binding.bot,
      purpose,
      body_sha256: await bodySha256(body),
      issued_at: issuedAt,
      expires_at: issuedAt + REQUEST_TTL_SECONDS,
      nonce: randomNonce(),
    };
    const device = await getCurrentDeviceKey(params.owner, issuedAt);
    if (!device) throw pubchiValidationError('SIGNATURE_INVALID', 'query');
    const request = await signRequestObjectV1({ ...unsigned, signer: device.signer }, device.key);
    assertRequestSignerIsStoredDevice(request.signer, device.signer);

    const response = await PubchiService.query({ request, body });
    return interpretQueryResponse(response);
  }
}

async function rollbackBindingWrite(
  params: PubchiBindingWriteParams,
  previous: Awaited<ReturnType<typeof LocalPubchiBindingService.read>>,
): Promise<void> {
  if (previous) {
    await LocalPubchiBindingService.upsert(previous);
    return;
  }
  await LocalPubchiBindingService.delete(params.owner, params.bot);
}

async function markBindingRevoked(
  local: NonNullable<Awaited<ReturnType<typeof LocalPubchiBindingService.readActive>>>,
) {
  const now = Math.floor(Date.now() / 1000);
  const revoked = {
    schema: 'pubchi-owner-binding' as const,
    version: 1 as const,
    owner: local.owner,
    bot: local.bot,
    status: 'revoked' as const,
    created_at: local.created_at,
    updated_at: now,
  };
  const parsed = parseOwnerBindingV1(revoked);
  if (!parsed.ok) throw pubchiValidationError(parsed.code, 'reconcileActiveBinding');
  await LocalPubchiBindingService.upsert({ ...parsed.value, id: bindingRecordId(local.owner, local.bot) });
}

function interpretQueryResponse(response: unknown): PubchiQuerySuccess {
  const schema = responseSchema(response);
  if (schema === 'pubchi-query-result') {
    const query = parseQueryResultV1(response);
    if (query.ok) return { kind: 'query', result: query.value };
    throw pubchiValidationError(query.code, 'query');
  }
  if (schema === 'pubchi-feed-proposal') {
    const feed = parseFeedProposalV1(response);
    if (feed.ok) return { kind: 'feed', result: feed.value, applyAllowed: true };
    if (
      feed.code === 'FEED_UNSUPPORTED_LIKES' ||
      feed.code === 'FEED_UNSUPPORTED_REACH' ||
      feed.code === 'FEED_SPECS_INVALID'
    ) {
      return { kind: 'feed-unsupported', code: feed.code };
    }
    throw pubchiValidationError(feed.code, 'query');
  }

  const code = extractPubchiErrorCode(response) ?? 'SCHEMA_INVALID';
  throw pubchiValidationError(code, 'query');
}

function responseSchema(response: unknown): string | undefined {
  if (response === null || typeof response !== 'object' || Array.isArray(response)) return undefined;
  const schema = (response as { schema?: unknown }).schema;
  return typeof schema === 'string' ? schema : undefined;
}

export function assertRequestSignerIsStoredDevice(signer: string | undefined, storedSigner: string): void {
  if (signer !== storedSigner) throw pubchiValidationError('DELEGATION_INVALID', 'query');
}

export function assertDeviceSignerIsPubkyId(signer: string, operation: string): void {
  if (!isPubkyId(signer)) throw pubchiValidationError('DELEGATION_INVALID', operation);
}

async function loadTrustedDeviceKey(owner: string, now: number) {
  assertPubchiCapability(owner);
  const device = await loadOrGenerateDeviceKey(owner, now);
  try {
    assertDeviceSignerIsPubkyId(device.signer, 'commitCreateBinding');
    return device;
  } catch {
    await deleteDeviceKey(owner, device.signer);
    const minted = await loadOrGenerateDeviceKey(owner, now);
    assertDeviceSignerIsPubkyId(minted.signer, 'commitCreateBinding');
    return minted;
  }
}

function assertPubchiCapability(owner: string): void {
  if (!sessionCanWritePubchi(owner)) throw pubchiValidationError('PATH_FORBIDDEN', 'pubchi');
}

function sessionCanWritePubchi(owner: string): boolean {
  const session = useAuthStore.getState().selectSession();
  if (!session) return false;
  const sessionPubky = session.info?.publicKey?.z32?.();
  if (!sessionPubky || sessionPubky !== owner) return false;
  return capabilitiesCoverPubchiWrite(session.info.capabilities);
}

function ownerPending(owner: string): PendingDelegationDelete[] {
  return readPendingDelegationDeletes().filter((item) => item.owner === owner);
}

function dedupePending(items: PendingDelegationDelete[]): PendingDelegationDelete[] {
  return [...new Map(items.map((item) => [`${item.owner}:${item.signer}`, item])).values()];
}

export function isDrainTimeout(error: unknown): boolean {
  return error instanceof AppError && error.category === ErrorCategory.Timeout;
}

function isAuthDenied(error: unknown): boolean {
  return (
    hasHttpStatus(error, HttpStatusCode.UNAUTHORIZED) ||
    hasHttpStatus(error, HttpStatusCode.FORBIDDEN) ||
    (error instanceof AppError && error.category === ErrorCategory.Auth)
  );
}

export async function deleteDelegationRecord(item: PendingDelegationDelete): Promise<void> {
  if (!isPubkyId(item.owner) || !isPubkyId(item.signer)) {
    throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
      service: ErrorService.Pubchi,
      operation: 'unpublishKnownDelegations',
    });
  }
  try {
    await HomeserverService.delete(delegationUri(item.owner, item.signer));
  } catch (error) {
    if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return;
    throw error;
  }
}

async function getDeviceKeysBounded(owner: string) {
  return withTimeout(getDeviceKeys(owner), PUBCHI_DELEGATION_DELETE_TIMEOUT_MS, 'Pubchi device-key read timed out');
}

async function liveDeviceSigners(
  owner: string,
): Promise<{ ok: true; signers: Set<string> } | { ok: false; defer: boolean }> {
  try {
    return { ok: true, signers: new Set((await getDeviceKeysBounded(owner)).map((key) => key.signer)) };
  } catch (error) {
    return { ok: false, defer: isDrainTimeout(error) };
  }
}

export async function listKnownDelegations(
  owner: string,
): Promise<{ kind: 'ok'; items: PendingDelegationDelete[] } | { kind: 'defer' }> {
  if (!isPubchiEnabled()) {
    return { kind: 'ok', items: ownerPending(owner) };
  }
  try {
    const keys = await getDeviceKeysBounded(owner);
    return {
      kind: 'ok',
      items: keys.flatMap((key) => {
        const entry = parsePendingEntry({ owner, signer: key.signer });
        return entry ? [entry] : [];
      }),
    };
  } catch (error) {
    if (isDrainTimeout(error)) return { kind: 'defer' };
    return { kind: 'ok', items: ownerPending(owner) };
  }
}

/**
 * Same-pubky restore keeps this owner's key. A missing key is left missing so
 * enroll can mint a fresh signer. Foreign local rows are wiped. Remote
 * delegations for a previous identity stay published until that identity signs
 * in again — we have no write capability on their `/pub/pubchi.app/` path.
 */
async function wipeLocalStateFromOtherIdentities(owner: string): Promise<void> {
  try {
    const foreign = await listDeviceKeysNotOwnedBy(owner);
    rememberPendingDelegationDeletesPreservingOwner(
      owner,
      foreign.flatMap((row) => {
        const entry = parsePendingEntry({ owner: row.owner, signer: row.signer });
        return entry ? [entry] : [];
      }),
    );
    await wipeDeviceKeysNotOwnedBy(owner);
    await LocalPubchiBindingService.deleteNotOwnedBy(owner);
  } catch (error) {
    Logger.warn('Pubchi foreign-identity wipe failed', { error });
  }
}
