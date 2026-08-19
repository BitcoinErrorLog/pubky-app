'use client';

import { useEffect, useState } from 'react';
import { getCommerceAdapterMode, getCommercePollIntervalMs } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { MarketplaceListingProjection } from '@/services/marketplace/marketplace';

export function useMarketplaceProjection(sellerPubky: string, listingId: string) {
  const [projection, setProjection] = useState<MarketplaceListingProjection | null>(null);
  const [isLoading, setIsLoading] = useState(getCommerceAdapterMode() === 'sandbox');
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
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
  };

  useEffect(() => {
    if (getCommerceAdapterMode() !== 'sandbox') {
      setIsLoading(false);
      return;
    }
    let active = true;
    const initialize = async () => {
      await CommerceController.initializeSandboxCatalog();
      if (active) await refresh();
    };
    void initialize();
    const timer = window.setInterval(() => {
      if (active) void refresh();
    }, getCommercePollIntervalMs());
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [listingId, sellerPubky]);

  return { projection, isLoading, error, refresh };
}
