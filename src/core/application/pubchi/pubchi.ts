import { AppError } from '@/libs/error/error';
import {
  AuthErrorCode,
  ClientErrorCode,
  DatabaseErrorCode,
  ServerErrorCode,
  TimeoutErrorCode,
  ValidationErrorCode,
} from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { getPubchiAudience } from '@/libs/pubchi/audience';
import { mintBotKey, phraseToBot } from '@/libs/pubchi/bot-key-custody';
import { capabilitiesCoverPubchiWrite, PUBCHI_PRIVATE_DIRECTORY, sessionCovers } from '@/libs/pubchi/capabilities';
import {
  deleteDeviceKey,
  DEVICE_DELEGATION_MAX_SECONDS,
  DEVICE_DELEGATION_REFRESH_SECONDS,
  getCurrentDeviceKey,
  getDeviceKeys,
  listDeviceKeysNotOwnedBy,
  loadOrGenerateDeviceKey,
  updateDeviceKeyExpiry,
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
  botUri,
  contextForRequest,
  DEFAULT_SEND_PUBLIC_WEB_CONTEXT,
  delegationUri,
  type DeviceDelegationV1,
  isPubkyId,
  ownerBindingsUri,
  ownerBindingUri,
  type OwnerBindingV1,
  parseDeviceDelegationV1,
  parseFeedProposal,
  parseOwnerBindingV1,
  parsePubchiAnswerV1,
  parsePubchiBotV1,
  parsePubchiConfigV1,
  parsePubchiOwnerContextV1,
  parseQueryResultV1,
  type PubchiBotV1,
  type PubchiConfigV1,
  type PubchiOwnerContextV1,
  REQUEST_TTL_SECONDS,
  scanForbiddenPublicState,
  signDeviceDelegationV1,
  signRequestObjectV2,
  type UnsignedDeviceDelegationV1,
  type UnsignedRequestObjectV2,
} from '@/libs/pubchi/schemas';
import { bindingRecordId } from '@/models/pubchi/binding.schema';
import { toast } from '@/molecules/Toaster/toast';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPubchiBindingService } from '@/services/local/pubchi/binding';
import { PubchiService } from '@/services/pubchi/pubchi';
import { useAuthStore } from '@/stores/auth/auth.store';
import type {
  ConfirmPubchiBackupParams,
  CreatedPubchi,
  CreatePubchiParams,
  LoadedPubchi,
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
  private static readonly deviceReadiness = new Map<string, Promise<boolean>>();
  private static deviceListingHadFailures = false;
  private static deviceListingUnlistedSigners: string[] = [];
  private static deviceListingUnlistedCount = 0;

  private constructor() {}

  static ensureDeviceReady(owner: string): Promise<boolean> {
    const inFlight = this.deviceReadiness.get(owner);
    if (inFlight) return inFlight;
    let readiness!: Promise<boolean>;
    readiness = (async () => {
      try {
        return await this.ensureDeviceReadyOnce(owner);
      } finally {
        if (this.deviceReadiness.get(owner) === readiness) {
          this.deviceReadiness.delete(owner);
        }
      }
    })();
    this.deviceReadiness.set(owner, readiness);
    return readiness;
  }

  private static async ensureDeviceReadyOnce(owner: string): Promise<boolean> {
    if (!isPubchiEnabled()) return false;
    const pointer = await readBotIfPresent(owner);
    if (!pointer) return false;
    const binding = await readOwnerBindingIfPresent(owner, pointer.bot);
    if (!binding || binding.owner !== owner || binding.bot !== pointer.bot || binding.status !== 'active') {
      return false;
    }
    await replaceLocalActiveBinding(binding);
    if (!sessionCanWritePubchi(owner)) return false;
    const device = await loadTrustedDeviceKey(owner, Math.floor(Date.now() / 1000));
    try {
      return await publishDeviceDelegation(owner, binding.bot, device);
    } catch {
      return false;
    }
  }

  static async loadPubchiConfig(owner: string, refreshDelegation = true): Promise<PubchiConfigV1 | null> {
    const url = pubchiConfigUri(owner);
    try {
      const raw = await HomeserverService.request<unknown>({ method: HttpMethod.GET, url });
      const parsed = parsePubchiConfigV1(raw);
      if (!parsed.ok) throw pubchiValidationError(parsed.code, 'loadPubchiConfig');
      if (refreshDelegation) await refreshPublishedDelegation(owner);
      return parsed.value;
    } catch (error) {
      if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return null;
      throw error;
    }
  }

  static async savePubchiConfig(owner: string, partial: Partial<PubchiConfigV1>): Promise<PubchiConfigV1> {
    assertPubchiCapability(owner);
    const binding = await LocalPubchiBindingService.readActive(owner);
    if (!binding) throw pubchiValidationError('BOT_MISMATCH', 'savePubchiConfig');
    const url = pubchiConfigUri(owner);
    let existing: PubchiConfigV1 | null;
    try {
      existing = await this.loadPubchiConfig(owner, false);
    } catch (error) {
      if (!hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) throw error;
      existing = null;
    }
    const now = Math.floor(Date.now() / 1000);
    const currentBot = await readBotIfPresent(owner);
    if (!currentBot) throw pubchiValidationError('BOT_MISMATCH', 'savePubchiConfig');
    const requestedDisplayName = partial.display_name?.trim();
    const displayName = requestedDisplayName ?? currentBot.display_name;
    const candidate = {
      ...(existing ?? defaultPubchiConfig(owner, binding.bot, now)),
      ...partial,
      owner,
      bot: binding.bot,
      display_name: displayName,
      updated_at: now,
    };
    const parsed = parsePubchiConfigV1(candidate);
    if (!parsed.ok) throw pubchiValidationError(parsed.code, 'savePubchiConfig');
    const forbidden = scanForbiddenPublicState(candidate);
    if (!forbidden.ok) throw pubchiValidationError(forbidden.code, 'savePubchiConfig');
    if (displayName !== currentBot.display_name) {
      await putAndVerifyBot(owner, { ...currentBot, display_name: displayName }, currentBot);
    }
    await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: parsed.value });
    const readBack = await this.loadPubchiConfig(owner);
    if (!readBack || !deepEqual(readBack, parsed.value)) {
      throw pubchiValidationError('SCHEMA_INVALID', 'savePubchiConfig');
    }
    return readBack;
  }

  static async loadPubchiContext(owner: string): Promise<PubchiOwnerContextV1 | null> {
    const session = useAuthStore.getState().selectSession();
    if (!session || !sessionCovers(session.info.capabilities ?? [], PUBCHI_PRIVATE_DIRECTORY)) return null;
    try {
      const parsed = parsePubchiOwnerContextV1(
        await HomeserverService.request<unknown>({ method: HttpMethod.GET, url: pubchiContextUri(owner) }),
      );
      if (!parsed.ok) throw pubchiValidationError(parsed.code, 'loadPubchiContext');
      return parsed.value;
    } catch (error) {
      if (
        hasHttpStatus(error, HttpStatusCode.NOT_FOUND) ||
        hasHttpStatus(error, HttpStatusCode.UNAUTHORIZED) ||
        hasHttpStatus(error, HttpStatusCode.FORBIDDEN)
      ) {
        return null;
      }
      throw error;
    }
  }

  static async savePubchiContext(
    owner: string,
    partial: Pick<PubchiOwnerContextV1, 'about' | 'instructions'>,
  ): Promise<PubchiOwnerContextV1> {
    const session = useAuthStore.getState().selectSession();
    if (!session || !sessionCovers(session.info.capabilities ?? [], PUBCHI_PRIVATE_DIRECTORY)) {
      throw pubchiValidationError('PATH_FORBIDDEN', 'savePubchiContext');
    }
    const existing = await this.loadPubchiContext(owner);
    const candidate = {
      schema: 'pubchi-owner-context' as const,
      version: 1 as const,
      ...(existing ?? {}),
      ...partial,
      updated_at: Math.floor(Date.now() / 1000),
    };
    const parsed = parsePubchiOwnerContextV1(candidate);
    if (!parsed.ok) throw pubchiValidationError(parsed.code, 'savePubchiContext');
    const url = pubchiContextUri(owner);
    await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: parsed.value });
    const readBack = await this.loadPubchiContext(owner);
    if (!readBack || !deepEqual(readBack, parsed.value)) {
      throw pubchiValidationError('SCHEMA_INVALID', 'savePubchiContext');
    }
    return readBack;
  }

  static async loadPubchiCursor(owner: string): Promise<string | null> {
    const session = useAuthStore.getState().selectSession();
    if (!session || !sessionCovers(session.info.capabilities ?? [], PUBCHI_PRIVATE_DIRECTORY)) return null;
    try {
      const value = await HomeserverService.request<unknown>({ method: HttpMethod.GET, url: pubchiCursorUri(owner) });
      if (!value || typeof value !== 'object' || typeof (value as { cursor?: unknown }).cursor !== 'string')
        return null;
      return (value as { cursor: string }).cursor;
    } catch (error) {
      if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return null;
      throw error;
    }
  }

  static async savePubchiCursor(owner: string, cursor: string): Promise<void> {
    const session = useAuthStore.getState().selectSession();
    if (!session || !sessionCovers(session.info.capabilities ?? [], PUBCHI_PRIVATE_DIRECTORY)) {
      throw pubchiValidationError('PATH_FORBIDDEN', 'savePubchiCursor');
    }
    const existing = await this.loadPubchiCursor(owner);
    await HomeserverService.request({
      method: HttpMethod.PUT,
      url: pubchiCursorUri(owner),
      bodyJson: { ...(existing ? { cursor: existing } : {}), cursor },
    });
  }

  static async getActiveBinding(owner: string): Promise<PubchiBindingRecordResult | undefined> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'getActiveBinding',
      });
    }
    return LocalPubchiBindingService.readActive(owner);
  }

  static async listDeviceDelegations(owner: string): Promise<DeviceDelegationV1[]> {
    if (!isPubchiEnabled()) return [];
    const files = await HomeserverService.listAll({ baseDirectory: devicesUri(owner) });
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const signer = file.match(/\/devices\/([^/]+)\.json$/)?.[1];
        if (!signer || !isPubkyId(signer)) return { signer: undefined, device: undefined, failed: false };
        try {
          const parsed = parseDeviceDelegationV1(
            await HomeserverService.request<unknown>({ method: HttpMethod.GET, url: delegationUri(owner, signer) }),
          );
          if (!parsed.ok || parsed.value.owner !== owner || parsed.value.signer !== signer) {
            return { signer, device: undefined, failed: false };
          }
          return { signer, device: parsed.value, failed: false };
        } catch {
          return { signer, device: undefined, failed: true };
        }
      }),
    );
    this.deviceListingHadFailures = results.some((result) => result.status === 'fulfilled' && result.value.failed);
    this.deviceListingUnlistedCount = results.filter(
      (result) => result.status === 'rejected' || !result.value.device,
    ).length;
    this.deviceListingUnlistedSigners = results.flatMap((result) => {
      if (result.status === 'rejected' || !result.value.device) {
        const signer = result.status === 'fulfilled' ? result.value.signer : undefined;
        return signer && isPubkyId(signer) ? [signer] : [];
      }
      return [];
    });
    return results.flatMap((result) =>
      result.status === 'fulfilled' && result.value.device ? [result.value.device] : [],
    );
  }

  static hadDeviceListingFailures(): boolean {
    return this.deviceListingHadFailures;
  }

  static getUnlistedDeviceSigners(): string[] {
    return [...this.deviceListingUnlistedSigners];
  }

  static async revokeDevice(owner: string, signer: string): Promise<void> {
    if (!isPubkyId(owner) || !isPubkyId(signer)) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
        service: ErrorService.Pubchi,
        operation: 'revokeDevice',
      });
    }
    const pending = { owner, signer };
    if (!rememberPendingDelegationDeletes([pending])) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Could not persist Pubchi device revocation', {
        service: ErrorService.Pubchi,
        operation: 'revokeDevice',
      });
    }
    if (!sessionCanWritePubchi(owner)) {
      await deleteDeviceKey(owner, signer);
      return;
    }
    await deleteAndVerifyMissing(delegationUri(owner, signer), 'revokeDevice');
    replacePendingDelegationDeletesForOwner(
      owner,
      ownerPending(owner).filter((item) => item.signer !== signer),
    );
    await deleteDeviceKey(owner, signer);
  }

  static async revokeAllDevices(owner: string): Promise<{
    revoked: string[];
    failed: string[];
    unlisted: number;
  }> {
    const [remote, local] = await Promise.all([this.listDeviceDelegations(owner), getDeviceKeys(owner)]);
    for (const device of local) {
      if (!isPubkyId(device.signer)) {
        await deleteDeviceKey(owner, device.signer);
      }
    }
    const unlistedSigners = this.getUnlistedDeviceSigners();
    rememberPendingDelegationDeletes(unlistedSigners.map((signer) => ({ owner, signer })));
    const signers = new Set([
      ...remote.map((device) => device.signer),
      ...local.filter((device) => isPubkyId(device.signer)).map((device) => device.signer),
      ...unlistedSigners,
    ]);
    const results = await Promise.allSettled([...signers].map((signer) => this.revokeDevice(owner, signer)));
    if (!sessionCanWritePubchi(owner)) {
      return {
        revoked: [],
        failed: [...signers],
        unlisted: this.deviceListingUnlistedCount,
      };
    }
    return {
      revoked: results.flatMap((result, index) => (result.status === 'fulfilled' ? [[...signers][index]!] : [])),
      failed: results.flatMap((result, index) => (result.status === 'rejected' ? [[...signers][index]!] : [])),
      unlisted: this.deviceListingUnlistedCount,
    };
  }

  static async createPubchi(params: CreatePubchiParams): Promise<CreatedPubchi> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'createPubchi',
      });
    }
    if (!capabilitiesCoverPubchiWrite(params.capabilities)) {
      throw pubchiValidationError('PATH_FORBIDDEN', 'createPubchi');
    }

    const existingPointer = await readBotIfPresent(params.owner);
    const existingBinding = existingPointer
      ? await readOwnerBindingIfPresent(params.owner, existingPointer.bot)
      : undefined;

    if (
      existingPointer &&
      existingBinding?.owner === params.owner &&
      existingBinding.bot === existingPointer.bot &&
      existingBinding.status === 'active'
    ) {
      await replaceLocalActiveBinding(existingBinding);
      await refreshPublishedDelegation(params.owner);
      throw Err.client(ClientErrorCode.CONFLICT, 'PUBCHI_ALREADY_EXISTS', {
        service: ErrorService.Pubchi,
        operation: 'createPubchi',
      });
    }
    await tombstoneUnreferencedRemoteBindings(params.owner, existingPointer?.bot, true);
    if (existingPointer?.homeserver_account !== null && existingPointer?.homeserver_account !== undefined) {
      throw Err.client(ClientErrorCode.CONFLICT, 'PUBCHI_ALREADY_EXISTS', {
        service: ErrorService.Pubchi,
        operation: 'createPubchi',
      });
    }

    const { bot, phrase } = mintBotKey();
    const now = Math.floor(Date.now() / 1000);
    const keyGeneration = existingPointer ? existingPointer.key_generation + 1 : 1;
    const createdAt = existingPointer?.created_at ?? now;
    const displayName = existingPointer?.display_name ?? params.displayName.trim();
    const bindingCandidate = {
      schema: 'pubchi-owner-binding' as const,
      version: 1 as const,
      owner: params.owner,
      bot,
      status: 'active' as const,
      key_generation: keyGeneration,
      created_at: createdAt,
      updated_at: now,
    };
    const parsedBinding = parseOwnerBindingV1(bindingCandidate);
    if (!parsedBinding.ok) throw pubchiValidationError(parsedBinding.code, 'createPubchi');

    const pointerCandidate = {
      schema: 'pubchi-bot' as const,
      version: 1 as const,
      bot,
      owner: params.owner,
      display_name: displayName,
      created_at: createdAt,
      backup_confirmed_at: null,
      homeserver_account: null,
      key_generation: keyGeneration,
    };
    const parsedPointer = parsePubchiBotV1(pointerCandidate);
    if (!parsedPointer.ok) throw pubchiValidationError(parsedPointer.code, 'createPubchi');

    await putAndVerifyOwnerBinding(params.owner, parsedBinding.value);
    await putAndVerifyBot(params.owner, parsedPointer.value, existingPointer);
    await readAndVerifyOwnerBinding(params.owner, parsedBinding.value);
    if (existingPointer) {
      await tombstoneBindingIfActive(params.owner, existingPointer.bot, now);
    }
    await replaceLocalActiveBinding(parsedBinding.value);

    const device = await loadTrustedDeviceKey(params.owner, now);
    const delegation: UnsignedDeviceDelegationV1 = {
      schema: 'pubchi-device-delegation',
      version: 1,
      owner: params.owner,
      signer: device.signer,
      bot,
      purposes: ['ask', 'who-tagged-me', 'build-feed'],
      created_at: device.created_at,
      expires_at: device.expires_at,
    };
    const signedDelegation = await signDeviceDelegationV1(delegation, device.key);
    await HomeserverService.request({
      method: HttpMethod.PUT,
      url: delegationUri(params.owner, device.signer),
      bodyJson: signedDelegation,
    });
    const delegationReadback = parseDeviceDelegationV1(
      await HomeserverService.request({
        method: HttpMethod.GET,
        url: delegationUri(params.owner, device.signer),
      }),
    );
    if (!delegationReadback.ok || !sameDelegation(delegationReadback.value, signedDelegation)) {
      throw pubchiValidationError('DELEGATION_INVALID', 'createPubchi');
    }

    return {
      bot,
      displayName: parsedPointer.value.display_name,
      createdAt: createdAt,
      backupConfirmedAt: null,
      verified: true,
      phrase,
    };
  }

  static async loadPubchi(owner: string): Promise<LoadedPubchi | undefined> {
    const pointer = await readBotIfPresent(owner);
    if (!pointer) return undefined;
    const binding = await readOwnerBindingIfPresent(owner, pointer.bot);
    await tombstoneUnreferencedRemoteBindings(owner, pointer.bot, false);
    const verified = binding?.bot === pointer.bot && binding.owner === pointer.owner && binding.status === 'active';
    if (verified && binding) {
      await replaceLocalActiveBinding(binding);
      await refreshPublishedDelegation(owner);
    }

    return {
      bot: pointer.bot,
      displayName: pointer.display_name,
      createdAt: pointer.created_at,
      backupConfirmedAt: pointer.backup_confirmed_at,
      verified,
    };
  }

  static async confirmBackup(params: ConfirmPubchiBackupParams): Promise<LoadedPubchi> {
    if (params.confirmations.length !== 3 || new Set(params.confirmations.map((item) => item.position)).size !== 3) {
      throw pubchiValidationError('SCHEMA_INVALID', 'confirmBackup');
    }
    const words = params.phrase.split(' ');
    const matches = params.confirmations.every(
      ({ position, word }) => position >= 0 && position < 12 && words[position] === word.trim().toLowerCase(),
    );
    if (!matches) throw pubchiValidationError('SIGNATURE_INVALID', 'confirmBackup');

    const bot = phraseToBot(params.phrase);
    const currentRaw = await HomeserverService.request({ method: HttpMethod.GET, url: botUri(params.owner) });
    const current = parsePubchiBotV1(currentRaw);
    if (!current.ok || current.value.owner !== params.owner || current.value.bot !== bot) {
      throw pubchiValidationError(current.ok ? 'BOT_MISMATCH' : current.code, 'confirmBackup');
    }
    const updated = { ...current.value, backup_confirmed_at: Math.floor(Date.now() / 1000) };
    await putAndVerifyBot(params.owner, updated, current.value);
    const loaded = await PubchiApplication.loadPubchi(params.owner);
    if (!loaded || loaded.backupConfirmedAt === null) {
      throw pubchiValidationError('SCHEMA_INVALID', 'confirmBackup');
    }
    return loaded;
  }

  static async commitCreateBinding(params: PubchiBindingWriteParams): Promise<PubchiBindingRecordResult> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'commitCreateBinding',
      });
    }

    assertPubchiCapability(params.owner);
    const pointer = await readBotIfPresent(params.owner);
    if (pointer && pointer.bot !== params.bot) {
      throw Err.client(ClientErrorCode.CONFLICT, 'PUBCHI_ALREADY_EXISTS', {
        service: ErrorService.Pubchi,
        operation: 'commitCreateBinding',
      });
    }
    const active = await LocalPubchiBindingService.readActive(params.owner);
    if (active && active.bot !== params.bot) {
      throw Err.client(ClientErrorCode.CONFLICT, 'PUBCHI_ALREADY_EXISTS', {
        service: ErrorService.Pubchi,
        operation: 'commitCreateBinding',
      });
    }

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
    const forbidden = scanForbiddenPublicState(candidate);
    if (!forbidden.ok) throw pubchiValidationError(forbidden.code, 'commitCreateBinding');

    const record = { ...parsed.value, id: bindingRecordId(params.owner, params.bot) };
    await LocalPubchiBindingService.upsert(record);

    try {
      const delegation: UnsignedDeviceDelegationV1 = {
        schema: 'pubchi-device-delegation',
        version: 1,
        owner: params.owner,
        signer: device.signer,
        bot: params.bot,
        purposes: [...SERVED_DELEGATION_PURPOSES],
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
      let rollbackError: unknown;
      try {
        await rollbackBindingWrite(params, existing);
      } catch (rollbackFailure) {
        rollbackError = rollbackFailure;
        Logger.error('[PubchiApplication.commitCreateBinding] Failed to rollback local binding write', rollbackFailure);
      }
      await HomeserverService.request({
        method: HttpMethod.DELETE,
        url: delegationUri(params.owner, device.signer),
      }).catch(() => {
        rememberPendingDelegationDeletes([{ owner: params.owner, signer: device.signer }]);
      });
      await deleteDeviceKey(params.owner, device.signer).catch(() => undefined);
      throw Err.server(
        ServerErrorCode.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'PUBCHI_BINDING_WRITE_FAILED',
        {
          service: ErrorService.Pubchi,
          operation: 'commitCreateBinding',
          cause: error,
          context: { rollbackError },
        },
      );
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

    const pointer = await readBotIfPresent(params.owner);
    const bot = pointer?.bot ?? params.bot;
    await deleteAndVerifyMissing(ownerBindingUri(params.owner, bot), 'commitDeleteBinding');
    if (pointer?.bot === bot) {
      await deleteAndVerifyMissing(botUri(params.owner), 'commitDeleteBinding');
    }
    await LocalPubchiBindingService.delete(params.owner, bot);
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
    if (!local) return findLegacyActiveBinding(owner);

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
      await refreshPublishedDelegation(owner);
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
    if (!pubchiEndpointFor(purpose) || !['ask', 'who-tagged-me', 'build-feed'].includes(purpose)) {
      throw pubchiValidationError('PURPOSE_UNSUPPORTED', 'query');
    }
    const servedPurpose = purpose as 'ask' | 'who-tagged-me' | 'build-feed';

    const body: PubchiAskBody = {
      question,
      ...(params.proposalVersion ? { proposal_version: params.proposalVersion } : {}),
      ...(params.targetFeedId ? { target_feed_id: params.targetFeedId } : {}),
      ...(params.currentFeed ? { current_feed: params.currentFeed } : {}),
    };
    const issuedAt = params.nowSeconds ?? Math.floor(Date.now() / 1000);
    const unsigned: UnsignedRequestObjectV2 = {
      schema: 'pubchi-request-object-v2',
      version: 2,
      audience: getPubchiAudience(),
      asker: params.owner,
      bot: binding.bot,
      key_generation: binding.key_generation ?? 1,
      purpose: servedPurpose,
      body_sha256: await bodySha256(body),
      issued_at: issuedAt,
      expires_at: issuedAt + REQUEST_TTL_SECONDS,
      nonce: randomNonce(),
      ...(servedPurpose === 'who-tagged-me' || !params.context ? {} : { context: contextForRequest(params.context) }),
    };
    const device = await getCurrentDeviceKey(params.owner, issuedAt);
    if (!device) throw pubchiValidationError('SIGNATURE_INVALID', 'query');
    const request = await signRequestObjectV2({ ...unsigned, signer: device.signer }, device.key);
    assertRequestSignerIsStoredDevice(request.signer, device.signer);

    const response = await PubchiService.query({ request, body });
    return interpretQueryResponse(response);
  }
}

async function putAndVerifyOwnerBinding(owner: string, candidate: OwnerBindingV1) {
  const url = ownerBindingUri(owner, candidate.bot);
  try {
    await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: candidate });
  } catch {
    const landed = await tryReadOwnerBinding(url, candidate);
    if (!landed) {
      await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: candidate });
    }
  }
  await readAndVerifyOwnerBinding(owner, candidate);
}

async function readAndVerifyOwnerBinding(owner: string, candidate: OwnerBindingV1): Promise<void> {
  const parsed = parseOwnerBindingV1(
    await HomeserverService.request({
      method: HttpMethod.GET,
      url: ownerBindingUri(owner, candidate.bot),
    }),
  );
  if (!parsed.ok || !sameOwnerBinding(parsed.value, candidate)) {
    throw pubchiValidationError(parsed.ok ? 'SCHEMA_INVALID' : parsed.code, 'createPubchi');
  }
}

async function tryReadOwnerBinding(url: string, candidate: OwnerBindingV1): Promise<boolean> {
  try {
    const parsed = parseOwnerBindingV1(await HomeserverService.request({ method: HttpMethod.GET, url }));
    return parsed.ok && sameOwnerBinding(parsed.value, candidate);
  } catch {
    return false;
  }
}

async function putAndVerifyBot(
  owner: string,
  candidate: PubchiBotV1,
  expectedCurrent: PubchiBotV1 | undefined,
): Promise<void> {
  const url = botUri(owner);
  const current = await readBotIfPresent(owner);
  if (
    (expectedCurrent === undefined && current !== undefined) ||
    (expectedCurrent !== undefined && (!current || !sameBot(current, expectedCurrent)))
  ) {
    throw pubchiValidationError('SCHEMA_INVALID', 'putAndVerifyBot');
  }
  const preservedCandidate = current ? { ...current, ...candidate } : candidate;
  try {
    await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: preservedCandidate });
  } catch {
    const landed = await tryReadBot(url, preservedCandidate);
    if (!landed) {
      await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: preservedCandidate });
    }
  }
  const parsed = parsePubchiBotV1(await HomeserverService.request({ method: HttpMethod.GET, url }));
  if (!parsed.ok || !sameBot(parsed.value, preservedCandidate)) {
    throw pubchiValidationError(parsed.ok ? 'SCHEMA_INVALID' : parsed.code, 'createPubchi');
  }
}

async function tryReadBot(url: string, candidate: PubchiBotV1): Promise<boolean> {
  try {
    const parsed = parsePubchiBotV1(await HomeserverService.request({ method: HttpMethod.GET, url }));
    return parsed.ok && sameBot(parsed.value, candidate);
  } catch {
    return false;
  }
}

async function readBotIfPresent(owner: string): Promise<PubchiBotV1 | undefined> {
  try {
    const parsed = parsePubchiBotV1(await HomeserverService.request({ method: HttpMethod.GET, url: botUri(owner) }));
    if (!parsed.ok || parsed.value.owner !== owner) {
      throw pubchiValidationError(parsed.ok ? 'SCHEMA_INVALID' : parsed.code, 'readBotIfPresent');
    }
    return parsed.value;
  } catch (error) {
    if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return undefined;
    throw error;
  }
}

async function readOwnerBindingIfPresent(owner: string, bot: string): Promise<OwnerBindingV1 | undefined> {
  try {
    const parsed = parseOwnerBindingV1(
      await HomeserverService.request({ method: HttpMethod.GET, url: ownerBindingUri(owner, bot) }),
    );
    if (!parsed.ok || parsed.value.owner !== owner || parsed.value.bot !== bot) {
      throw pubchiValidationError(parsed.ok ? 'SCHEMA_INVALID' : parsed.code, 'readOwnerBindingIfPresent');
    }
    return parsed.value;
  } catch (error) {
    if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return undefined;
    throw error;
  }
}

async function tombstoneUnreferencedRemoteBindings(
  owner: string,
  referencedBot: string | undefined,
  failClosed: boolean,
): Promise<void> {
  try {
    const files = await HomeserverService.listAll({ baseDirectory: ownerBindingsUri(owner) });
    for (const file of files) {
      const match = file.match(/\/bots\/([^/]+)\.json$/);
      const bot = match?.[1];
      if (!bot || !isPubkyId(bot) || bot === referencedBot) continue;
      await tombstoneBindingIfActive(owner, bot, Math.floor(Date.now() / 1000));
    }
  } catch (error) {
    if (failClosed) throw error;
  }
}

async function findLegacyActiveBinding(owner: string): Promise<OwnerBindingV1 | undefined> {
  try {
    const files = await HomeserverService.listAll({ baseDirectory: ownerBindingsUri(owner) });
    for (const file of files) {
      const match = file.match(/\/bots\/([^/]+)\.json$/);
      const bot = match?.[1];
      if (!bot || !isPubkyId(bot)) continue;
      const binding = await readOwnerBindingIfPresent(owner, bot);
      if (binding?.status === 'active' && binding.owner === owner && binding.bot === bot) return binding;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function tombstoneBindingIfActive(owner: string, bot: string, now: number): Promise<void> {
  const remote = await readOwnerBindingIfPresent(owner, bot);
  if (!remote || remote.status !== 'active') return;
  const url = ownerBindingUri(owner, bot);
  const tombstone = {
    ...remote,
    status: 'revoked' as const,
    updated_at: now,
  };
  await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: tombstone });
  const verified = parseOwnerBindingV1(await HomeserverService.request({ method: HttpMethod.GET, url }));
  if (!verified.ok || !sameOwnerBinding(verified.value, tombstone)) {
    throw pubchiValidationError(verified.ok ? 'SCHEMA_INVALID' : verified.code, 'createPubchi');
  }
  await LocalPubchiBindingService.upsert({
    ...tombstone,
    id: bindingRecordId(owner, bot),
  });
}

async function replaceLocalActiveBinding(binding: OwnerBindingV1): Promise<void> {
  await LocalPubchiBindingService.replaceActive({
    ...binding,
    id: bindingRecordId(binding.owner, binding.bot),
  });
}

async function deleteAndVerifyMissing(url: string, operation: string): Promise<void> {
  try {
    await HomeserverService.request({ method: HttpMethod.DELETE, url });
  } catch (error) {
    if (!hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) throw error;
  }
  try {
    await HomeserverService.request({ method: HttpMethod.GET, url });
  } catch (error) {
    if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) return;
    throw error;
  }
  throw pubchiValidationError('SCHEMA_INVALID', operation);
}

function sameOwnerBinding(left: OwnerBindingV1, right: OwnerBindingV1): boolean {
  return (
    left.schema === right.schema &&
    left.version === right.version &&
    left.owner === right.owner &&
    left.bot === right.bot &&
    left.status === right.status &&
    left.key_generation === right.key_generation &&
    left.created_at === right.created_at &&
    left.updated_at === right.updated_at
  );
}

function sameBot(left: PubchiBotV1, right: PubchiBotV1): boolean {
  return (
    left.schema === right.schema &&
    left.version === right.version &&
    left.owner === right.owner &&
    left.bot === right.bot &&
    left.display_name === right.display_name &&
    left.created_at === right.created_at &&
    left.backup_confirmed_at === right.backup_confirmed_at &&
    left.homeserver_account === right.homeserver_account &&
    left.key_generation === right.key_generation
  );
}

function sameDelegation(left: DeviceDelegationV1, right: DeviceDelegationV1): boolean {
  return (
    left.owner === right.owner &&
    left.signer === right.signer &&
    left.bot === right.bot &&
    left.created_at === right.created_at &&
    left.expires_at === right.expires_at &&
    left.signature === right.signature &&
    left.purposes.length === right.purposes.length &&
    left.purposes.every((purpose, index) => purpose === right.purposes[index])
  );
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
  if (schema === 'pubchi-answer') {
    const answer = parsePubchiAnswerV1(response);
    if (answer.ok) return { kind: 'answer', result: answer.value };
    throw pubchiValidationError(answer.code, 'query');
  }
  if (schema === 'pubchi-query-result') {
    const query = parseQueryResultV1(response);
    if (query.ok) return { kind: 'query', result: query.value };
    throw pubchiValidationError(query.code, 'query');
  }
  if (schema === 'pubchi-feed-proposal') {
    const feed = parseFeedProposal(response);
    if (!feed.ok) {
      if (
        feed.code === 'FEED_UNSUPPORTED_LIKES' ||
        feed.code === 'FEED_UNSUPPORTED_REACH' ||
        feed.code === 'FEED_SPECS_INVALID'
      ) {
        return { kind: 'feed-unsupported', code: feed.code };
      }
      throw pubchiValidationError(feed.code, 'query');
    }
    if (feed.value.version === 2) return { kind: 'feed-v2', result: feed.value, applyAllowed: false };
    return { kind: 'feed', result: feed.value, applyAllowed: true };
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

function pubchiConfigUri(owner: string): string {
  return `pubky://${owner}/pub/pubchi.app/config.json`;
}

function pubchiContextUri(owner: string): string {
  return `pubky://${owner}/priv/pubchi.app/context.json`;
}

function pubchiCursorUri(owner: string): string {
  return `pubky://${owner}/priv/pubchi.app/cursor.json`;
}

function devicesUri(owner: string): string {
  return `pubky://${owner}/pub/pubchi.app/devices/`;
}

function defaultPubchiConfig(owner: string, bot: string, now: number): PubchiConfigV1 {
  return {
    schema: 'pubchi-config',
    version: 1,
    bot,
    owner,
    updated_at: now,
    display_name: 'Pubchi',
    tier: 'read-only',
    language: 'en',
    summary: { length: 'short', include_sources: true, include_disagreement: true },
    interests: { topics: [], excluded_topics: [] },
    proactive: { enabled: false, max_suggestions_per_day: 1, quiet_hours_utc: { start: 22, end: 7 } },
    follower_history_opt_in: false,
    brain: {
      adapter: 'vercel-ai',
      execution: 'synonym-hosted',
      provider_id: 'moonshot',
      model_id: 'kimi-k3',
      endpoint: null,
      send_public_graph_context: true,
      send_public_web_context: DEFAULT_SEND_PUBLIC_WEB_CONTEXT,
    },
  };
}

const SERVED_DELEGATION_PURPOSES = ['ask', 'who-tagged-me', 'build-feed'] as const;

export async function refreshPublishedDelegation(owner: string): Promise<void> {
  if (!sessionCanWritePubchi(owner)) return;
  const binding = await LocalPubchiBindingService.readActive(owner);
  if (!binding) return;
  const now = Math.floor(Date.now() / 1000);
  const device = await getCurrentDeviceKey(owner, now);
  if (!device) return;
  try {
    await publishDeviceDelegation(owner, binding.bot, device, now);
  } catch {
    return;
  }
}

async function publishDeviceDelegation(
  owner: string,
  bot: string,
  device: Awaited<ReturnType<typeof loadOrGenerateDeviceKey>>,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const url = delegationUri(owner, device.signer);
  let current: ReturnType<typeof parseDeviceDelegationV1>;
  try {
    const raw = await HomeserverService.request<unknown>({ method: HttpMethod.GET, url });
    current = parseDeviceDelegationV1(raw);
    if (!current.ok) current = { ok: false, code: 'SCHEMA_INVALID' };
  } catch (error) {
    if (!hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) throw error;
    current = { ok: false, code: 'SCHEMA_INVALID' };
  }
  if (
    current.ok &&
    current.value.owner === owner &&
    current.value.signer === device.signer &&
    current.value.bot === bot &&
    SERVED_DELEGATION_PURPOSES.every((purpose) => current.value.purposes.includes(purpose)) &&
    current.value.expires_at - now > DEVICE_DELEGATION_REFRESH_SECONDS
  ) {
    return true;
  }
  const unsigned: UnsignedDeviceDelegationV1 = {
    schema: 'pubchi-device-delegation',
    version: 1,
    owner,
    signer: device.signer,
    bot,
    purposes: current.ok ? [...current.value.purposes] : [...SERVED_DELEGATION_PURPOSES],
    created_at: Math.max(device.created_at, now),
    expires_at: now + DEVICE_DELEGATION_MAX_SECONDS,
  };
  const signed = await signDeviceDelegationV1(unsigned, device.key);
  await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: signed });
  const readBack = parseDeviceDelegationV1(await HomeserverService.request<unknown>({ method: HttpMethod.GET, url }));
  if (!readBack.ok || JSON.stringify(readBack.value) !== JSON.stringify(signed)) {
    throw pubchiValidationError('SCHEMA_INVALID', 'refreshPublishedDelegation');
  }
  await updateDeviceKeyExpiry(owner, device.signer, signed.expires_at);
  return true;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  return (
    keys.length === Object.keys(rightRecord).length &&
    keys.every((key) => key in rightRecord && deepEqual(leftRecord[key], rightRecord[key]))
  );
}

function sessionCanWritePubchi(owner: string): boolean {
  const session = useAuthStore.getState().selectSession();
  if (!session) return false;
  const sessionPubky = session.info?.publicKey?.z32?.();
  if (!sessionPubky || sessionPubky !== owner) return false;
  return capabilitiesCoverPubchiWrite(session.info.capabilities);
}

function ownerPending(owner: string): PendingDelegationDelete[] {
  return readPendingDelegationDeletes(owner);
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
