'use client';

import { useIsGrantSession } from '@/hooks/useIsGrantSession/useIsGrantSession';
import { getMarketplaceGrantFlowEnabled } from '@/libs/runtime-config/runtime-config';

export type MarketplaceApprovalSigner = 'Bitkit' | 'Pubky Ring';

/**
 * The signer that approves marketplace purchases for this sign-in: Bitkit
 * for a Bitkit (grant) sign-in that can bootstrap, Pubky Ring otherwise.
 */
export function useMarketplaceApprovalSigner(): MarketplaceApprovalSigner {
  return useIsGrantSession() && getMarketplaceGrantFlowEnabled() ? 'Bitkit' : 'Pubky Ring';
}
