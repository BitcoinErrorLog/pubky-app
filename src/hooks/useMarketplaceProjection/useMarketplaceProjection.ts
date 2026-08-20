'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { getCommerceAdapterMode, getCommercePollIntervalMs, isTransactionalCommerceMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { MarketplaceListingProjection } from '@/services/marketplace/marketplace';

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
  const [projection, setProjection] = useState<MarketplaceListingProjection | null>(null);
  const [isLoading, setIsLoading] = useState(isTransactional);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => loadProjection(sellerPubky, listingId, setProjection, setIsLoading, setError);

  useEffect(() => {
    if (!isTransactional) {
      setIsLoading(false);
      return;
    }
    let active = true;
    void loadProjection(sellerPubky, listingId, setProjection, setIsLoading, setError);
    const timer = window.setInterval(() => {
      if (active) void loadProjection(sellerPubky, listingId, setProjection, setIsLoading, setError);
    }, getCommercePollIntervalMs());
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isTransactional, listingId, sellerPubky]);

  return { projection, isLoading, error, refresh };
}

async function loadProjection(
  sellerPubky: string,
  listingId: string,
  setProjection: Dispatch<SetStateAction<MarketplaceListingProjection | null>>,
  setIsLoading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | null>>,
): Promise<void> {
  if (!isTransactionalCommerceMode(getCommerceAdapterMode())) return;
  try {
    const next = await CommerceController.getMarketplaceListingProjection(sellerPubky, listingId);
    setProjection(next);
    setError(next ? null : 'Transaction projection is not registered.');
  } catch (loadError) {
    setError(
      loadError instanceof Error && loadError.name === 'AppError'
        ? loadError.message
        : 'Transaction service is unavailable.',
    );
  } finally {
    setIsLoading(false);
  }
}
