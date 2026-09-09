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

function paykitServerOrigin(): string {
  return new URL(getPaykitSetupUrl()).origin;
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
  unavailable: 'The Paykit server is unavailable. Try again shortly.',
};

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
