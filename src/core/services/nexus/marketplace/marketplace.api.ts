import type { TListingStreamParams } from '@/services/nexus/marketplace/marketplace.types';
import { buildUrlWithQuery } from '@/services/nexus/nexus.utils';

/**
 * Marketplace API Endpoints
 *
 * URL builders for the Nexus marketplace index. Only the listing stream is
 * consumed today: full record content is always hydrated from the canonical
 * homeserver (ADR-0020), so the per-entity projection endpoints
 * (`v0/shop/{seller_id}`, `v0/listing/{seller_id}/{listing_id}`) have no
 * client consumer yet.
 */

const STREAM_LISTINGS_ROUTE = 'v0/stream/listings';

export const marketplaceApi = {
  listingStream: (params: TListingStreamParams) => buildUrlWithQuery({ baseRoute: STREAM_LISTINGS_ROUTE, params }),
};

export type MarketplaceApiEndpoint = keyof typeof marketplaceApi;
