'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
 *
 * The count and the checkpoint are tagged with the pubky they were read for.
 * An identity change clears both before paint, and a result whose pubky is
 * no longer signed in is dropped.
 */
type TaggedCount = { pubky: string; count: number };
type TaggedSeen = { pubky: string; seenAt: number };

export function useMarketplaceOrdersAttention(): number {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const marketplaceSession = useCommerceStore((state) => state.marketplaceSession);
  const adapterMode = getCommerceAdapterMode();
  const [trackedPubky, setTrackedPubky] = useState(currentUserPubky);
  const [seen, setSeen] = useState<TaggedSeen | null>(null);
  const [taggedCount, setTaggedCount] = useState<TaggedCount | null>(null);
  const pubkyRef = useRef(currentUserPubky);
  useLayoutEffect(() => {
    pubkyRef.current = currentUserPubky;
  }, [currentUserPubky]);

  if (trackedPubky !== currentUserPubky) {
    setTrackedPubky(currentUserPubky);
    setSeen(null);
    setTaggedCount(null);
  }

  const seenAt = seen?.pubky === currentUserPubky ? seen.seenAt : 0;
  const count = taggedCount?.pubky === currentUserPubky ? taggedCount.count : 0;

  useEffect(() => {
    if (!currentUserPubky) {
      setSeen(null);
      return;
    }
    const pubky = currentUserPubky;
    const read = () => {
      if (pubkyRef.current !== pubky) return;
      setSeen({ pubky, seenAt: readOrdersSeenAt(pubky, window.localStorage) });
    };
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
      setTaggedCount(currentUserPubky ? { pubky: currentUserPubky, count: 0 } : null);
      return;
    }
    const fetchedFor = currentUserPubky;
    const fetchedSeenAt = seenAt;
    let active = true;
    // A stubbed controller (tests) throws before a promise exists. That is a
    // failed load: the badge stays at zero.
    Promise.resolve()
      .then(() => CommerceController.getMarketplaceOrders())
      .then((orders) => {
        if (!active || pubkyRef.current !== fetchedFor) return;
        setTaggedCount({
          pubky: fetchedFor,
          count: countOrdersNeedingAttention(orders, fetchedFor, fetchedSeenAt),
        });
      })
      .catch((error) => {
        if (!active || pubkyRef.current !== fetchedFor) return;
        setTaggedCount({ pubky: fetchedFor, count: 0 });
        Logger.warn('Failed to load the marketplace orders badge count', { error });
      });
    return () => {
      active = false;
    };
  }, [currentUserPubky, adapterMode, marketplaceSession, seenAt]);

  return count;
}
