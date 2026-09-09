import { z } from 'zod';
import { getPaykitSetupUrl } from '@/config/commerce';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HomeserverService } from '@/services/homeserver/homeserver';

/**
 * The exact capability grant paykit-server requires on a manual claim token
 * (root tokens are refused): write access to the Bitkit companion receiver
 * tree and nothing else. Ring shows this string verbatim, so the seller sees
 * precisely what the claim can touch.
 */
export const PAYKIT_CLAIM_CAPABILITIES = '/pub/paykit/v0/bitkit/server/:rw,/pub/paykit/v0/private/bitkit/server/:rw';

const CLAIM_FLOW_TIMEOUT_MS = 120_000;

/** Machine-readable claim failures the settings UI branches on. */
export type PaykitClaimErrorReason =
  | 'invalid_xpub'
  | 'account_mismatch'
  | 'account_index_out_of_range'
  | 'key_claimed_by_other_seller'
  | 'invalid_token'
  | 'invalid_capabilities'
  | 'rate_limited'
  | 'session_unavailable'
  | 'paykit_origin_insecure'
  | 'unavailable';

/**
 * A successful claim, as paykit-server reports it. The four W1.3 fields
 * (`key_fingerprint`, `first_derived_address`, `next_child_index`,
 * `stack_id`) are what the client verifies the claim against before anything
 * is enabled; they are `null` when the server predates W1.3, and the claim
 * hook fails closed on that case (`server_fingerprint_missing`).
 */
export interface PaykitClaimResult {
  creator: string;
  accountIndex: number;
  keyFingerprint: string | null;
  firstDerivedAddress: string | null;
  nextChildIndex: number | null;
  stackId: string | null;
}

export interface PaykitClaimFlow {
  /** `pubkyauth://` URL for the seller's signer (QR / deeplink). */
  authorizationUrl: string;
  /** Resolves once the signer approves and paykit-server accepts the claim. */
  awaitClaim: () => Promise<PaykitClaimResult>;
  cancel: () => void;
}

/**
 * The authenticated status body (design §B.8.6), parsed with a Zod schema:
 * unknown extra fields are ignored, and a body missing any REQUIRED field
 * is a refusal — the gate fails closed rather than trusting a partial
 * answer. `allocation_mode`, `key_fingerprint` and `first_derived_address`
 * are required; `claim_channel` and `downgrade_reason` are present but
 * nullable on the server.
 */
const ownClaimStatusBodySchema = z.object({
  allocation_mode: z.string(),
  claim_channel: z.string().nullable(),
  downgrade_reason: z.string().nullable(),
  key_fingerprint: z.string(),
  first_derived_address: z.string(),
});

/** The seller's own claim status as the authenticated status read reports it. */
export interface PaykitOwnClaimStatus {
  allocationMode: string;
  claimChannel: string | null;
  downgradeReason: string | null;
  keyFingerprint: string;
  firstDerivedAddress: string;
}

/**
 * The outcome of the authenticated status probe. `not_deployed` is the 404
 * case: the server predates W1.13 (or nothing is claimed) — the gate shuts
 * either way, and the UI adds the not-available line. `refused` covers
 * 401/403/5xx, network failures, and schema rejections.
 */
export type FetchOwnClaimStatusResult =
  | { ok: true; status: PaykitOwnClaimStatus }
  | { ok: false; reason: 'not_deployed' | 'refused' };

export interface PaykitClaimStatusFlow {
  /** `pubkyauth://` URL for the seller's signer (QR / deeplink). */
  authorizationUrl: string;
  /** Resolves once the signer approves and the status read completes. */
  awaitStatus: () => Promise<FetchOwnClaimStatusResult>;
  cancel: () => void;
}

function toBase64UrlNoPad(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

const CLAIM_FAILURE_MESSAGES: Record<PaykitClaimErrorReason, string> = {
  invalid_xpub: 'The Paykit server rejected the pasted key. Export the BIP84 account xpub for the right network.',
  account_mismatch:
    'A different watch-only account is already claimed for this identity. Existing payment requests watch its addresses, so it cannot be replaced from here.',
  account_index_out_of_range: 'This account index is outside the range Shop accepts (0–99).',
  key_claimed_by_other_seller: 'This key is already claimed by another seller on this stack.',
  invalid_token: 'The signer approval could not be verified. Start the claim again.',
  invalid_capabilities: 'The signer approval carried the wrong permissions. Start the claim again.',
  rate_limited: 'Too many claim attempts. Wait a moment and try again.',
  session_unavailable: 'The Paykit server could not reach your homeserver to verify the approval. Try again shortly.',
  paykit_origin_insecure:
    'The Paykit server address is not a secure HTTPS origin, so Shop refused to send your approval to it. Contact the operator.',
  unavailable: 'The Paykit server is unavailable. Try again shortly.',
};

/**
 * Loopback hosts a dev deployment may reach over plain `http:` (the schema
 * default is `http://localhost:3102/setup`). Every other paykit origin must
 * be HTTPS: the claim POST sends `auth_token` in the body and the status GET
 * sends `Authorization: Bearer <AuthToken>` — a claim credential must never
 * travel to a cleartext origin (W1.8 F1).
 */
const PAYKIT_INSECURE_ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The single choke point every paykit call builds its URL from. Fails
 * closed — before any token is built or byte is sent — on a non-HTTPS origin
 * that is not loopback, with the static `paykit_origin_insecure` copy (the
 * same fail-closed shape as `bitcoin_network_unconfigured`).
 */
function paykitServerOrigin(): string {
  const url = new URL(getPaykitSetupUrl());
  if (url.protocol !== 'https:' && !PAYKIT_INSECURE_ALLOWED_HOSTNAMES.has(url.hostname)) {
    throw Err.client(ClientErrorCode.BAD_REQUEST, CLAIM_FAILURE_MESSAGES.paykit_origin_insecure, {
      service: ErrorService.Paykit,
      operation: 'paykitServerOrigin',
      context: { reason: 'paykit_origin_insecure' },
    });
  }
  return url.origin;
}

/**
 * Manual watch-only account claim — the same registration Bitkit's setup
 * performs, minus the wallet: the seller pastes their account xpub, approves
 * a claim-scoped token on their signer, and this flow POSTs both to
 * paykit-server, which verifies the token, publishes the receiver marker,
 * and persists the account. The identity secret never enters this app; the
 * xpub is watch-only public material.
 */
export class MarketplacePaykitClaimService {
  private constructor() {}

  /**
   * `accountIndex` is the hardened account index the key itself declares
   * (child number at offset 9..13 of the normalized 78 bytes, hardened bit
   * cleared — derived by the caller via `accountIndexFromBytes`). The server
   * cross-checks it against the submitted xpub and accepts 0–99; there is no
   * client-side default.
   */
  static beginClaimFlow(accountXpub: string, accountIndex: number): PaykitClaimFlow {
    // Fail closed BEFORE a claim token is built: an insecure paykit origin
    // must never receive one (W1.8 F1).
    paykitServerOrigin();
    const flow = HomeserverService.generateAuthTokenFlow(PAYKIT_CLAIM_CAPABILITIES);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const awaitClaim = async () => {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          flow.cancelAuthFlow();
          reject(
            Err.client(ClientErrorCode.BAD_REQUEST, 'The claim request expired before it was approved. Start again.', {
              service: ErrorService.Paykit,
              operation: 'awaitClaim',
              context: { timeoutMs: CLAIM_FLOW_TIMEOUT_MS },
            }),
          );
        }, CLAIM_FLOW_TIMEOUT_MS);
      });
      try {
        const authToken = await Promise.race([flow.awaitToken(), timeout]);
        return await this.submitClaim(authToken.toBytes(), accountXpub, accountIndex);
      } finally {
        clearTimeout(timer);
      }
    };
    return { authorizationUrl: flow.authorizationUrl, awaitClaim, cancel: flow.cancelAuthFlow };
  }

  /** `GET /v0/accounts/{creator}` — public existence lookup. */
  static async isAccountClaimed(pubky: string): Promise<boolean> {
    const url = `${paykitServerOrigin()}/v0/accounts/${encodeURIComponent(`pubky${pubky}`)}`;
    const response = await safeFetch(url, { method: 'GET' }, ErrorService.Paykit, 'isAccountClaimed');
    if (!response.ok) {
      throw Err.client(ClientErrorCode.BAD_REQUEST, 'The Paykit server could not report the account state.', {
        service: ErrorService.Paykit,
        operation: 'isAccountClaimed',
        context: { statusCode: response.status },
      });
    }
    const body = (await response.json()) as { claimed?: boolean };
    return body.claimed === true;
  }

  /**
   * `GET /v0/accounts/{creator}/status` with `Authorization: Bearer
   * <base64url(AuthToken)>` — the AUTHENTICATED seller-status read (design
   * §B.8.6). The token is the same capability-scoped Pubky AuthToken the
   * claim POST sends (`verify_claim_token` on the server is shared by both
   * paths), obtained through the Ring approval flow. Unlike the public
   * existence lookup above — which is display-only and may never open the
   * `bitcoinEnabled` gate — a 200 here binds the claim to THIS session and
   * THIS identity, so it is one of the two paths allowed to record a
   * verified claim.
   *
   * Fail-closed on every outcome short of a well-formed 200: `not_deployed`
   * when the server answers 404 (a deployment predating W1.13 has no such
   * route; a W1.13 server also 404s when nothing is claimed — both shut the
   * gate identically), `refused` on 401/403/5xx, a network failure, or a
   * body that fails the schema (missing required fields, wrong types).
   */
  static async fetchOwnClaimStatus(pubky: string, authTokenBytes: Uint8Array): Promise<FetchOwnClaimStatusResult> {
    let origin: string;
    try {
      origin = paykitServerOrigin();
    } catch {
      // The insecure-origin refusal already logged via the Err factory; the
      // probe fails closed like every other refusal, with no fetch sent.
      return { ok: false, reason: 'refused' };
    }
    const url = `${origin}/v0/accounts/${encodeURIComponent(`pubky${pubky}`)}/status`;
    let response: Response;
    try {
      response = await safeFetch(
        url,
        { method: 'GET', headers: { authorization: `Bearer ${toBase64UrlNoPad(authTokenBytes)}` } },
        ErrorService.Paykit,
        'fetchOwnClaimStatus',
      );
    } catch {
      // safeFetch already logged the network-level failure; the probe fails
      // closed without double-logging.
      return { ok: false, reason: 'refused' };
    }
    if (response.status === 404) return { ok: false, reason: 'not_deployed' };
    if (!response.ok) return { ok: false, reason: 'refused' };
    const parsed = ownClaimStatusBodySchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return { ok: false, reason: 'refused' };
    return {
      ok: true,
      status: {
        allocationMode: parsed.data.allocation_mode,
        claimChannel: parsed.data.claim_channel,
        downgradeReason: parsed.data.downgrade_reason,
        keyFingerprint: parsed.data.key_fingerprint,
        firstDerivedAddress: parsed.data.first_derived_address,
      },
    };
  }

  /**
   * The Ring-approved status verification ("Verify with Ring"): the seller
   * approves the exact claim capability grant on their signer, and the
   * resulting token authenticates one `fetchOwnClaimStatus` read. Same
   * token type the claim POST sends — the server verifies the capability
   * set offline and answers 403 for any identity but the addressed seller.
   */
  static beginClaimStatusFlow(pubky: string): PaykitClaimStatusFlow {
    // Fail closed BEFORE a claim token is built (W1.8 F1); the status read
    // re-checks the origin before the fetch.
    paykitServerOrigin();
    const flow = HomeserverService.generateAuthTokenFlow(PAYKIT_CLAIM_CAPABILITIES);
    const awaitStatus = async () => {
      const authToken = await flow.awaitToken();
      return await this.fetchOwnClaimStatus(pubky, authToken.toBytes());
    };
    return { authorizationUrl: flow.authorizationUrl, awaitStatus, cancel: flow.cancelAuthFlow };
  }

  private static async submitClaim(
    authTokenBytes: Uint8Array,
    accountXpub: string,
    accountIndex: number,
  ): Promise<PaykitClaimResult> {
    const url = `${paykitServerOrigin()}/v0/accounts/claim`;
    const response = await safeFetch(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          auth_token: toBase64UrlNoPad(authTokenBytes),
          account_xpub: accountXpub.trim(),
          account_index: accountIndex,
        }),
      },
      ErrorService.Paykit,
      'submitClaim',
    );
    const body = (await response.json().catch(() => ({}))) as {
      status?: string;
      creator?: string;
      account_index?: number;
      key_fingerprint?: string;
      first_derived_address?: string;
      next_child_index?: number;
      stack_id?: string;
      error?: { code?: string; message?: string };
    };
    if (!response.ok || body.status !== 'claimed' || !body.creator) {
      const reason = (body.error?.code ?? 'unavailable') as PaykitClaimErrorReason;
      throw Err.client(
        ClientErrorCode.BAD_REQUEST,
        CLAIM_FAILURE_MESSAGES[reason] ?? CLAIM_FAILURE_MESSAGES.unavailable,
        {
          service: ErrorService.Paykit,
          operation: 'submitClaim',
          context: { statusCode: response.status, reason },
        },
      );
    }
    return {
      creator: body.creator,
      accountIndex: body.account_index ?? accountIndex,
      keyFingerprint: typeof body.key_fingerprint === 'string' ? body.key_fingerprint : null,
      firstDerivedAddress: typeof body.first_derived_address === 'string' ? body.first_derived_address : null,
      nextChildIndex: typeof body.next_child_index === 'number' ? body.next_child_index : null,
      stackId: typeof body.stack_id === 'string' ? body.stack_id : null,
    };
  }
}
