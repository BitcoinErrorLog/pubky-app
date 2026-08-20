/**
 * Nexus marketplace types
 *
 * Mirror the response shapes served by the Nexus marketplace index
 * (`nexus-common/src/models/marketplace/*` on the `feat/marketplace-indexing`
 * branch of pubky-nexus). Field names are snake_case exactly as serialized by
 * Nexus; enum values follow the snake_case serde renames in `pubky-app-specs`.
 *
 * These are lossy read projections of the owner-signed homeserver records —
 * they carry no media metadata, variants, sale terms, shipping options, or
 * return policy, so they can never be written into the `commerce_listings` /
 * `commerce_shops` record caches directly. The homeserver stays canonical for
 * record content (ADR-0020); Nexus provides discovery, ordering, and revision
 * freshness.
 */

export type NexusListingState = 'active' | 'paused' | 'ended' | 'removed';

export type NexusListingCondition = 'new' | 'like_new' | 'excellent' | 'good' | 'fair' | 'for_parts';

export type NexusListingSaleFormat = 'fixed_price' | 'auction';

export type NexusFulfillmentMethod = 'physical' | 'digital' | 'pickup';

export type NexusSortOrder = 'ascending' | 'descending';

/** One indexed listing as returned by `GET v0/stream/listings` and `GET v0/listing/{seller_id}/{listing_id}`. */
export type NexusListingDetails = {
  id: string;
  uri: string;
  owner_id: string;
  indexed_at: number;
  state: NexusListingState;
  title: string;
  description: string;
  category_id: string;
  condition: NexusListingCondition;
  tags: string[];
  country_code: string;
  region: string | null;
  media_urls: string[];
  sale_format: NexusListingSaleFormat;
  price_amount_minor: number;
  price_currency: string;
  price_exponent: number;
  fulfillment_methods: NexusFulfillmentMethod[];
  adult_only: boolean;
  created_at: string;
  updated_at: string;
  revision: number;
};

/**
 * Query parameters accepted by `GET v0/stream/listings`.
 *
 * `min_price` / `max_price` are expressed in major units and Nexus rejects
 * them unless `currency` is also provided. `category` is an exact match on
 * the kebab-case category id. `limit` is capped server-side at 30.
 */
export type TListingStreamParams = {
  seller_id?: string;
  category?: string;
  condition?: NexusListingCondition;
  sale_format?: NexusListingSaleFormat;
  state?: NexusListingState;
  min_price?: number;
  max_price?: number;
  currency?: string;
  order?: NexusSortOrder;
  skip?: number;
  limit?: number;
  start?: number;
  end?: number;
};
