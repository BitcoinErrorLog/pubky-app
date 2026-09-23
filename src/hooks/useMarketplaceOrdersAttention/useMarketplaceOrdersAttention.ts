'use client';

import { useEffect, useState } from 'react';
import { getCommerceAdapterMode, isTransactionalCommerceMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import {
  countOrdersNeedingAttention,
  MARKETPLACE_ORDERS_SEEN_EVENT,
  readOrdersSeenAt,
} from '@/libs/commerce/marketplace-attention';
import { Logger } from '@/libs/logger/logger';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCommerceStore } from '@/stores/commerce/commerce.store';

/**
 * Orders whose next move is the signed-in identity, newer than the last time
 * this browser opened the Orders tab for that identity. The durable service
 * has no read state for orders, so the checkpoint lives in local storage.
 * A failed fetch contributes zero.
 */
export function useMarketplaceOrdersAttention(): number {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const marketplaceSession = useCommerceStore((state) => state.marketplaceSession);
  const adapterMode = getCommerceAdapterMode();
  const [seenAt, setSeenAt] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!currentUserPubky) {
      setSeenAt(0);
      return;
    }
    const read = () => setSeenAt(readOrdersSeenAt(currentUserPubky, window.localStorage));
    read();
    window.addEventListener(MARKETPLACE_ORDERS_SEEN_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(MARKETPLACE_ORDERS_SEEN_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, [currentUserPubky]);

  useEffect(() => {
    if (!currentUserPubky || !isTransactionalCommerceMode(adapterMode)) {
      setCount(0);
      return;
    }
    let active = true;
    CommerceController.getMarketplaceOrders()
      .then((orders) => {
        if (!active) return;
        setCount(countOrdersNeedingAttention(orders, currentUserPubky, seenAt));
      })
      .catch((error) => {
        if (!active) return;
        setCount(0);
        Logger.warn('Failed to load the marketplace orders badge count', { error });
      });
    return () => {
      active = false;
    };
  }, [currentUserPubky, adapterMode, marketplaceSession, seenAt]);

  return count;
}
