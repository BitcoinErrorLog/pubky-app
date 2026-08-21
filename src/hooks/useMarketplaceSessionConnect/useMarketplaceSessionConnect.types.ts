import type { CommerceMarketplaceSession } from '@/stores/commerce/commerce.types';

/**
 * Lifecycle of one interactive session-connect attempt:
 *
 * - `idle`      — no flow in progress (initial, after cancel).
 * - `awaiting`  — an authorization URL exists and the flow is waiting for the
 *                 user to approve on their signer.
 * - `connected` — the signer approved and the AuthToken was exchanged for a
 *                 bearer session; the store now carries the session facts.
 * - `error`     — the flow failed (relay timeout, rejected token, service
 *                 unreachable). The URL is cleared because AuthToken flows are
 *                 single-use: retrying always starts a FRESH flow.
 */
export type MarketplaceSessionConnectStatus = 'idle' | 'awaiting' | 'connected' | 'error';

export interface UseMarketplaceSessionConnectOptions {
  /** Called once per successful connect, after the store has been updated. */
  onConnected?: (session: CommerceMarketplaceSession) => void;
}

export interface UseMarketplaceSessionConnectReturn {
  status: MarketplaceSessionConnectStatus;
  /** The `pubkyauth://` URL to render as a QR or open as a Ring deeplink. Empty outside `awaiting`. */
  authorizationUrl: string;
  /** The real failure message when `status === 'error'`, never a placeholder. */
  errorMessage: string | null;
  /** Begins a fresh flow, cancelling any in-flight one. */
  start: () => void;
  /** Cancels the in-flight flow (frees it) and returns to `idle`. */
  cancel: () => void;
  /** Copies the authorization URL for manual transfer to the signer device. */
  copyAuthUrl: () => Promise<void>;
  /** Opens the authorization URL as a deeplink (same-device Pubky Ring). */
  openInRing: () => void;
  /** True between tapping "Open in Pubky Ring" and the page losing focus to the Ring app. */
  isOpeningRing: boolean;
}
