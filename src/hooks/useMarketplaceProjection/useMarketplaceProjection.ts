'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { getCommerceAdapterMode, getCommercePollIntervalMs, isTransactionalCommerceMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { isMarketplaceSessionRequiredError } from '@/libs/error/error.utils';
import type { MarketplaceListingProjection } from '@/services/marketplace/marketplace';
import { useCommerceStore } from '@/stores/commerce/commerce.store';

/**
 * Polls the listing/inventory projection from whichever transactional backend
 * the mode selects (sandbox or durable transaction service). The projection's
 * `serverRevision` is what bid/offer/checkout commands send as
 * `expected_revision`, so interactive flows are only enabled while this read
 * works. Failures surface as `error` — including the durable service's
 * session requirement, which carries its own guidance.
 */
export function useMarketplaceProjection(sellerPubky: string, listingId: string) {
  const isTransactional = isTransactionalCommerceMode(getCommerceAdapterMode());
  // Refetch trigger: connecting a session replaces this store object, so the
  // effect below re-runs immediately instead of waiting for the next poll.
  const marketplaceSession = useCommerceStore((state) => state.marketplaceSession);
  const [projection, setProjection] = useState<MarketplaceListingProjection | null>(null);
  const [isLoading, setIsLoading] = useState(isTransactional);
  const [error, setError] = useState<string | null>(null);
  const [needsSession, setNeedsSession] = useState(false);

  const refresh = () => loadProjection(sellerPubky, listingId, setProjection, setIsLoading, setError, setNeedsSession);

  useEffect(() => {
    if (!isTransactional) {
      setIsLoading(false);
      return;
    }
    let active = true;
    void loadProjection(sellerPubky, listingId, setProjection, setIsLoading, setError, setNeedsSession);
    const timer = window.setInterval(() => {
      if (active) void loadProjection(sellerPubky, listingId, setProjection, setIsLoading, setError, setNeedsSession);
    }, getCommercePollIntervalMs());
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isTransactional, listingId, sellerPubky, marketplaceSession]);

  return { projection, isLoading, error, needsSession, refresh };
}

async function loadProjection(
  sellerPubky: string,
  listingId: string,
  setProjection: Dispatch<SetStateAction<MarketplaceListingProjection | null>>,
  setIsLoading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | null>>,
  setNeedsSession: Dispatch<SetStateAction<boolean>>,
): Promise<void> {
  if (!isTransactionalCommerceMode(getCommerceAdapterMode())) return;
  try {
    const next = await CommerceController.getMarketplaceListingProjection(sellerPubky, listingId);
    setProjection(next);
    setError(next ? null : 'Transaction projection is not registered.');
    setNeedsSession(false);
  } catch (loadError) {
    // A missing/expired marketplace session is not a dead end: flag it so the
    // listing surface renders the session-connect affordance.
    setNeedsSession(isMarketplaceSessionRequiredError(loadError));
    setError(
      loadError instanceof Error && loadError.name === 'AppError'
        ? loadError.message
        : 'Transaction service is unavailable.',
    );
  } finally {
    setIsLoading(false);
  }
}
