'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { getCommerceAdapterMode, getCommercePollIntervalMs } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { MarketplaceListingProjection } from '@/services/marketplace/marketplace';

export function useMarketplaceProjection(sellerPubky: string, listingId: string) {
  const [projection, setProjection] = useState<MarketplaceListingProjection | null>(null);
  const [isLoading, setIsLoading] = useState(getCommerceAdapterMode() === 'sandbox');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => loadProjection(sellerPubky, listingId, setProjection, setIsLoading, setError);

  useEffect(() => {
    if (getCommerceAdapterMode() !== 'sandbox') {
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
  }, [listingId, sellerPubky]);

  return { projection, isLoading, error, refresh };
}

async function loadProjection(
  sellerPubky: string,
  listingId: string,
  setProjection: Dispatch<SetStateAction<MarketplaceListingProjection | null>>,
  setIsLoading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | null>>,
): Promise<void> {
  if (getCommerceAdapterMode() !== 'sandbox') return;
  try {
    const next = await CommerceController.getMarketplaceListingProjection(sellerPubky, listingId);
    setProjection(next);
    setError(next ? null : 'Transaction projection is not registered.');
  } catch {
    setError('Transaction service is unavailable.');
  } finally {
    setIsLoading(false);
  }
}
