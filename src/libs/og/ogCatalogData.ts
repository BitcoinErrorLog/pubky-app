import { NEXUS_LISTINGS_PER_PAGE } from '@/config/nexus';
import {
  catalogItemFromCatalogEntry,
  type MarketplaceCatalogItem,
} from '@/hooks/useMarketplaceCatalog/useMarketplaceCatalog.utils';
import { Logger } from '@/libs/logger/logger';
import { getCommerceAdapterMode } from '@/libs/runtime-config/runtime-config';
import { CommerceRecordNormalizer } from '@/pipes/commerce/commerce.normalizer';
import { marketplaceApi } from '@/services/nexus/marketplace/marketplace.api';
import { OG_COMMERCE_REVALIDATE } from './ogCommerceData';

/**
 * Server-only first page of the public Nexus marketplace listing stream for
 * the `/marketplace` catalog HTML. Same constraints as `ogCommerceData`: no
 * Dexie/controller writes — a read of public index projections, cached with
 * the listing/shop OG revalidate window. The Nexus base URL is resolved from
 * runtime config at call time (`getMarketplaceNexusUrl` inside `marketplaceApi`).
 *
 * Sandbox deployments never query Nexus (seeded local catalogs only).
 */
export async function fetchMarketplaceCatalogForSsr(): Promise<MarketplaceCatalogItem[]> {
  if (getCommerceAdapterMode() === 'sandbox') return [];

  const url = marketplaceApi.listingStream({
    state: 'active',
    limit: NEXUS_LISTINGS_PER_PAGE,
  });

  try {
    const res = await fetch(url, { next: { revalidate: OG_COMMERCE_REVALIDATE } });
    if (!res.ok) {
      Logger.warn('[ogCatalogData] Listing stream failed', { url, status: res.status });
      return [];
    }

    const json: unknown = await res.json();
    return CommerceRecordNormalizer.nexusListingStream(json).map(catalogItemFromCatalogEntry);
  } catch (error) {
    Logger.warn('[ogCatalogData] Failed to fetch marketplace listing stream', { error });
    return [];
  }
}
