import {
  MARKETPLACE_TAGS_PATH_PARAMS,
  type TListingStreamParams,
  type TListingTagsParams,
  type TShopTagsParams,
} from '@/services/nexus/marketplace/marketplace.types';
import { buildUrlWithQuery, encodePathSegment } from '@/services/nexus/nexus.utils';

/**
 * Marketplace API Endpoints
 *
 * URL builders for the Nexus marketplace index. The listing stream feeds the
 * catalog grid from its projections, while canonical record content is
 * hydrated from the owner homeserver on demand (ADR-0020), so the per-entity
 * projection endpoints (`v0/shop/{seller_id}`,
 * `v0/listing/{seller_id}/{listing_id}`) have no client consumer yet.
 *
 * The tag endpoints mirror the post tag routes and are served by the
 * marketplace Nexus once its tag aggregation lands; the client treats a 404
 * from them as "aggregation not deployed" and degrades to local-only tags.
 */

const STREAM_LISTINGS_ROUTE = 'v0/stream/listings';
const LISTING_PREFIX = 'v0/listing';
const SHOP_PREFIX = 'v0/shop';

export const marketplaceApi = {
  listingStream: (params: TListingStreamParams) => buildUrlWithQuery({ baseRoute: STREAM_LISTINGS_ROUTE, params }),
  listingTags: (params: TListingTagsParams) => {
    const seller = encodePathSegment(params.seller_id);
    const listing = encodePathSegment(params.listing_id);
    return buildUrlWithQuery({
      baseRoute: `${LISTING_PREFIX}/${seller}/${listing}/tags`,
      params,
      excludeKeys: MARKETPLACE_TAGS_PATH_PARAMS,
    });
  },
  shopTags: (params: TShopTagsParams) => {
    const seller = encodePathSegment(params.seller_id);
    return buildUrlWithQuery({
      baseRoute: `${SHOP_PREFIX}/${seller}/tags`,
      params,
      excludeKeys: MARKETPLACE_TAGS_PATH_PARAMS,
    });
  },
};

export type MarketplaceApiEndpoint = keyof typeof marketplaceApi;
