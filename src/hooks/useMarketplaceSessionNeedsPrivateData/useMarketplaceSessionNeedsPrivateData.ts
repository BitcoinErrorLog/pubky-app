'use client';

import { PRIVATE_APP_DATA_PATH } from '@/services/homeserver/homeserver';
import { capabilitiesGrantWrite } from '@/services/homeserver/homeserver.utils';
import {
  capabilitiesCoverScope,
  MARKETPLACE_PRIVATE_DATA_SCOPE,
} from '@/services/marketplace/marketplace-session-grant';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCommerceStore } from '@/stores/commerce/commerce.store';

/**
 * True when the signed-in homeserver session can already write the Shop's
 * private tree but the purchase session for the same pubky does not cover
 * `/priv/pubky.app/` with read and write — the state in which
 * `GET /v1/me/priv-keys` answers `needs_reauth`. The fix is a new purchase
 * session approval (Bitkit or Pubky Ring), not a homeserver step-up.
 */
export function useMarketplaceSessionNeedsPrivateData(): boolean {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const homeserverCapabilities = useAuthStore((state) => state.session?.info?.capabilities ?? null);
  const marketplaceSession = useCommerceStore((state) => state.marketplaceSession);
  if (!currentUserPubky || !homeserverCapabilities) return false;
  if (!capabilitiesGrantWrite(homeserverCapabilities, PRIVATE_APP_DATA_PATH)) return false;
  return !(
    marketplaceSession?.pubky === currentUserPubky &&
    capabilitiesCoverScope(marketplaceSession.capabilities, MARKETPLACE_PRIVATE_DATA_SCOPE)
  );
}
