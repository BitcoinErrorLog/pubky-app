import { marketplaceApi } from '@/services/nexus/marketplace/marketplace.api';
import type {
  NexusListingDetails,
  TListingDetailsParams,
  TListingStreamParams,
  TListingTagsParams,
  TShopTagsParams,
} from '@/services/nexus/marketplace/marketplace.types';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { queryNexus } from '@/services/nexus/nexus.utils';

/**
 * Nexus Marketplace Service
 *
 * Read-only access to the Nexus marketplace index. Responses are lossy
 * projections used for discovery; canonical record content is fetched from
 * the owner's homeserver (see `CommerceApplication`).
 */
export class NexusMarketplaceService {
  private constructor() {}

  /**
   * Fetches a page of indexed listings, newest-indexed first by default.
   *
   * @param params - Server-side filters and pagination (see `TListingStreamParams`)
   * @returns Array of listing projections; empty when nothing matches
   */
  static async fetchListingStream(params: TListingStreamParams = {}): Promise<NexusListingDetails[]> {
    return await queryNexus<NexusListingDetails[]>({ url: marketplaceApi.listingStream(params) });
  }

  /**
   * Fetches one indexed listing's projection — the watchlist's bounded
   * per-item freshness read (revision, price, state, auction deadline).
   * 404s propagate; the caller decides whether "not indexed" is meaningful.
   *
   * @param params - Seller/listing path params
   * @returns The listing projection as currently indexed by Nexus
   */
  static async fetchListingDetails(params: TListingDetailsParams): Promise<NexusListingDetails> {
    return await queryNexus<NexusListingDetails>({ url: marketplaceApi.listingDetails(params) });
  }

  /**
   * Fetches the community tag aggregate for a listing.
   *
   * Served by the marketplace Nexus once tag aggregation is deployed; until
   * then the endpoint answers 404 and callers degrade to local-only tags.
   *
   * @param params - Seller/listing path params plus pagination and viewer id
   * @returns Array of tag aggregates (empty when the listing has no tags)
   */
  static async fetchListingTags(params: TListingTagsParams): Promise<NexusTag[]> {
    return await queryNexus<NexusTag[]>({ url: marketplaceApi.listingTags(params) });
  }

  /**
   * Fetches the community tag aggregate for a shop.
   *
   * Same deployment caveat as `fetchListingTags`.
   *
   * @param params - Seller path param plus pagination and viewer id
   * @returns Array of tag aggregates (empty when the shop has no tags)
   */
  static async fetchShopTags(params: TShopTagsParams): Promise<NexusTag[]> {
    return await queryNexus<NexusTag[]>({ url: marketplaceApi.shopTags(params) });
  }
}
