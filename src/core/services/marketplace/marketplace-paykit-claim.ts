import { z } from 'zod';
import { getPaykitSetupUrl } from '@/config/commerce';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { PAYKIT_ORIGIN_INSECURE_MESSAGE } from '@/services/marketplace/paykit-origin';
import { assertSecurePaykitOrigin } from '@/services/marketplace/paykit-origin-assert';

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
  | 'unknown_claim_channel'
  | 'allocation_mode_not_enabled'
  | 'creator_mismatch'
  | 'unavailable';

/**
 * A successful claim, as paykit-server reports it (W1.13 r3). The four W1.3
 * fields (`key_fingerprint`, `first_derived_address`, `next_child_index`,
 * `stack_id`) are what the client verifies the claim against before anything
 * is enabled; they are `null` when the server predates W1.3, and the claim
 * hook fails closed on that case (`server_fingerprint_missing`). The W1.13 r3
 * additions (`allocation_mode`, `claim_channel`, `downgrade_reason`,
 * `first_child_index`) are likewise `null` on an older server — the
 * verification fails closed on a missing `first_child_index`
 * (`server_first_index_missing`).
 */
export interface PaykitClaimResult {
  creator: string;
  accountIndex: number;
  keyFingerprint: string | null;
  firstDerivedAddress: string | null;
  /** The immutable claim-time child index the first address derives at. */
  firstChildIndex: number | null;
  nextChildIndex: number | null;
  stackId: string | null;
  allocationMode: string | null;
  claimChannel: string | null;
  downgradeReason: string | null;
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
 * answer. `creator`, `allocation_mode`, `key_fingerprint`,
 * `first_derived_address` and the three derivation coordinates
 * (`account_index`, `first_child_index`, `next_child_index`) are required;
 * `claim_channel` and `downgrade_reason` are OPTIONAL and nullable on the
 * server — a server that omits them must not trip the refusal. The echoed
 * `creator` must BE the seller the read was authenticated for; anything else
 * is a refusal.
 */
const ownClaimStatusBodySchema = z.object({
  creator: z.string(),
  allocation_mode: z.string(),
  claim_channel: z.string().nullish(),
  downgrade_reason: z.string().nullish(),
  key_fingerprint: z.string(),
  first_derived_address: z.string(),
  account_index: z.number().int().nonnegative(),
  first_child_index: z.number().int().nonnegative(),
  next_child_index: z.number().int().nonnegative(),
});

/** The seller's own claim status as the authenticated status read reports it. */
export interface PaykitOwnClaimStatus {
  allocationMode: string;
  claimChannel: string | null;
  downgradeReason: string | null;
  keyFingerprint: string;
  firstDerivedAddress: string;
  accountIndex: number;
  /** The immutable claim-time child index the first address derives at. */
  firstChildIndex: number;
  /** The mutable derivation cursor — informational only, never compared. */
  nextChildIndex: number;
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
  paykit_origin_insecure: PAYKIT_ORIGIN_INSECURE_MESSAGE,
  unknown_claim_channel: 'The Paykit server refused the claim channel Shop declared. Update Shop or contact the operator.',
  allocation_mode_not_enabled:
    'This Paykit server does not allow automatic payment detection for pasted keys. Claim with Bitkit instead, or contact the operator.',
  creator_mismatch:
    'The Paykit server confirmed the claim for a different identity than the one you approved with, so nothing was enabled. Start the claim again.',
  unavailable: 'The Paykit server is unavailable. Try again shortly.',
};

/**
 * The W1.13 r3 claim success body. `status` must be `claimed` and `creator`
 * must echo the seller the flow was begun for — both verified by the caller.
 * The verification fields stay `.nullish()` so a pre-W1.13 server parses; the
 * post-claim verification (`verifyClaimedAccount`) fails closed on the
 * missing values instead of the parse.
 */
const claimResponseBodySchema = z.object({
  status: z.literal('claimed'),
  creator: z.string(),
  account_index: z.number().int().nonnegative().nullish(),
  allocation_mode: z.string().nullish(),
  claim_channel: z.string().nullish(),
  downgrade_reason: z.string().nullish(),
  key_fingerprint: z.string().nullish(),
  first_derived_address: z.string().nullish(),
  first_child_index: z.number().int().nonnegative().nullish(),
  next_child_index: z.number().int().nonnegative().nullish(),
  stack_id: z.string().nullish(),
});

/**
 * The single choke point every paykit call builds its URL from. Fails
 * closed — before any token is built or byte is sent — on a non-HTTPS origin
 * that is not loopback, via the shared `assertSecurePaykitOrigin` guard
 * (the same guard the setup-navigation builder in `services/locks/locks.ts`
 * runs, so the two can never diverge — W1.8b N1).
 */
function paykitServerOrigin(): string {
  const url = new URL(getPaykitSetupUrl());
  assertSecurePaykitOrigin(url, 'paykitServerOrigin');
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
  static beginClaimFlow(pubky: string, accountXpub: string, accountIndex: number): PaykitClaimFlow {
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
        return await this.submitClaim(authToken.toBytes(), pubky, accountXpub, accountIndex);
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
    // The echoed creator must BE the seller this read was authenticated for
    // (W1.13 r3): a 200 about any other identity is a refusal, not data.
    if (parsed.data.creator !== `pubky${pubky}`) return { ok: false, reason: 'refused' };
    return {
      ok: true,
      status: {
        allocationMode: parsed.data.allocation_mode,
        claimChannel: parsed.data.claim_channel ?? null,
        downgradeReason: parsed.data.downgrade_reason ?? null,
        keyFingerprint: parsed.data.key_fingerprint,
        firstDerivedAddress: parsed.data.first_derived_address,
        accountIndex: parsed.data.account_index,
        firstChildIndex: parsed.data.first_child_index,
        nextChildIndex: parsed.data.next_child_index,
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
    expectedPubky: string,
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
          // The paste path declares its channel explicitly (W1.13 r3): a
          // pasted bare key is `manual` semantics, and saying so keeps the
          // claim honest if the server default ever moves.
          claim_channel: 'manual',
        }),
      },
      ErrorService.Paykit,
      'submitClaim',
    );
    const rawBody = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    if (!response.ok) {
      const reason = (rawBody.error?.code ?? 'unavailable') as PaykitClaimErrorReason;
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
    const parsed = claimResponseBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw Err.client(ClientErrorCode.BAD_REQUEST, CLAIM_FAILURE_MESSAGES.unavailable, {
        service: ErrorService.Paykit,
        operation: 'submitClaim',
        context: { statusCode: response.status, reason: 'unavailable' },
      });
    }
    const body = parsed.data;
    // The echoed creator must BE the seller this flow was begun for (W1.13
    // r3): a claim confirmed for any other identity can never open the gate
    // on this session.
    if (body.creator !== `pubky${expectedPubky}`) {
      throw Err.client(ClientErrorCode.BAD_REQUEST, CLAIM_FAILURE_MESSAGES.creator_mismatch, {
        service: ErrorService.Paykit,
        operation: 'submitClaim',
        context: { statusCode: response.status, reason: 'creator_mismatch' },
      });
    }
    return {
      creator: body.creator,
      accountIndex: body.account_index ?? accountIndex,
      keyFingerprint: body.key_fingerprint ?? null,
      firstDerivedAddress: body.first_derived_address ?? null,
      firstChildIndex: body.first_child_index ?? null,
      nextChildIndex: body.next_child_index ?? null,
      stackId: body.stack_id ?? null,
      allocationMode: body.allocation_mode ?? null,
      claimChannel: body.claim_channel ?? null,
      downgradeReason: body.downgrade_reason ?? null,
    };
  }
}
