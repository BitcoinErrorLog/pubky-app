'use client';

import { useEffect } from 'react';
import { CommerceController } from '@/controllers/commerce/commerce';
import { Logger } from '@/libs/logger/logger';
import { useAuthStore } from '@/stores/auth/auth.store';

/**
 * Moves the signed-in account's Orders checkpoint to now whenever `shown`
 * orders are on screen, so the Orders badge clears on every browser.
 */
export function useMarkMarketplaceOrdersSeen(isShowingOrders: boolean, shown: unknown): void {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  useEffect(() => {
    if (!currentUserPubky || !isShowingOrders) return;
    CommerceController.markOrdersAttentionSeen().catch((error) => {
      Logger.warn('Failed to advance the orders badge checkpoint', { error });
    });
  }, [currentUserPubky, isShowingOrders, shown]);
}
