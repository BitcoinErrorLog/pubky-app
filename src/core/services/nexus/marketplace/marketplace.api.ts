import { getMarketplaceNexusUrl } from '@/config/nexus';
import type { TListingStreamParams } from '@/services/nexus/marketplace/marketplace.types';
import { buildUrlWithQuery } from '@/services/nexus/nexus.utils';

/**
 * Marketplace API Endpoints
 *
 * URL builders for the Nexus marketplace index. Only the listing stream is
 * consumed today: the grid renders from its projections, while canonical
 * record content is hydrated from the owner homeserver on demand (ADR-0020),
 * so the per-entity projection endpoints (`v0/shop/{seller_id}`,
 * `v0/listing/{seller_id}/{listing_id}`) have no client consumer yet.
 *
 * Every builder here MUST route through `getMarketplaceNexusUrl()`: the
 * marketplace index endpoints may live on a dedicated Nexus deployment
 * (`PUBKY_RUNTIME_MARKETPLACE_NEXUS_URL`) while social reads stay on the main
 * `nexusUrl`. When the override is unset both resolve to the same Nexus.
 */

const STREAM_LISTINGS_ROUTE = 'v0/stream/listings';

export const marketplaceApi = {
  listingStream: (params: TListingStreamParams) =>
    buildUrlWithQuery({ baseRoute: STREAM_LISTINGS_ROUTE, params, baseUrl: getMarketplaceNexusUrl() }),
};

export type MarketplaceApiEndpoint = keyof typeof marketplaceApi;
