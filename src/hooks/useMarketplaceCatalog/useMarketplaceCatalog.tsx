'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getCommerceAdapterMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import { filterMarketplaceCatalog } from './useMarketplaceCatalog.utils';

export function useMarketplaceCatalog() {
  const query = useCommerceStore((state) => state.query);
  const categoryId = useCommerceStore((state) => state.categoryId);
  const saleFormat = useCommerceStore((state) => state.saleFormat);
  const conditions = useCommerceStore((state) => state.conditions);
  const minimumPriceMinor = useCommerceStore((state) => state.minimumPriceMinor);
  const maximumPriceMinor = useCommerceStore((state) => state.maximumPriceMinor);
  const sort = useCommerceStore((state) => state.sort);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const adapterMode = getCommerceAdapterMode();

  useEffect(() => {
    let active = true;
    CommerceController.initializeSandboxCatalog().catch(() => {
      if (active) setInitializationError('The marketplace catalog could not be initialized.');
    });
    return () => {
      active = false;
    };
  }, []);

  const localListings = useLiveQuery(() => CommerceController.getAllListings(), []);
  const localShops = useLiveQuery(() => CommerceController.getAllShops(), []);
  const listings = filterMarketplaceCatalog(localListings ?? [], {
    query,
    categoryId,
    saleFormat,
    conditions,
    minimumPriceMinor,
    maximumPriceMinor,
    sort,
  });
  const shopsBySeller = new Map((localShops ?? []).map(({ owner_id, record }) => [owner_id, record]));

  return {
    listings,
    shopsBySeller,
    isLoading: localListings === undefined || localShops === undefined,
    initializationError,
    adapterMode,
  };
}
