'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getCommerceAdapterMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { Logger } from '@/libs/logger/logger';
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
  const adapterMode = getCommerceAdapterMode();

  // Sandbox catalogs are seeded locally and never query Nexus (see
  // docs/ecommerce/RUNNING.md), so in that mode there is no refresh to wait for.
  const [isRefreshing, setIsRefreshing] = useState(adapterMode !== 'sandbox');

  useEffect(() => {
    if (adapterMode === 'sandbox') return;

    let active = true;
    setIsRefreshing(true);
    CommerceController.fetchCatalogListings({ saleFormat, conditions })
      .catch((error) => {
        // The catalog keeps rendering from the local cache when the index is
        // unreachable; discovery just does not widen until it comes back.
        Logger.warn('[useMarketplaceCatalog] Nexus catalog refresh failed; rendering cached catalog', { error });
      })
      .finally(() => {
        if (active) setIsRefreshing(false);
      });

    return () => {
      active = false;
    };
  }, [adapterMode, saleFormat, conditions]);

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

  // While a refresh is in flight over an empty cache, stay in the loading
  // state so the skeleton shows instead of flashing "No listings match"
  // before the first discovery results land.
  const isCacheUnresolved = localListings === undefined || localShops === undefined;
  const isCacheEmpty = localListings !== undefined && localListings.length === 0;

  return {
    listings,
    shopsBySeller,
    isLoading: isCacheUnresolved || (isCacheEmpty && isRefreshing),
    adapterMode,
  };
}
