/**
 * Nexus marketplace types
 *
 * Mirror the response shapes served by the Nexus marketplace index
 * (`nexus-common/src/models/marketplace/*` on the `feat/marketplace-indexing`
 * branch of pubky-nexus). Field names are snake_case exactly as serialized by
 * Nexus; enum values follow the snake_case serde renames in `pubky-app-specs`.
 *
 * These are lossy read projections of the owner-signed homeserver records —
 * they carry no media metadata, variants, shipping options, or return policy,
 * so they can never be written into the `commerce_listings` / `commerce_shops`
 * record caches directly. The homeserver stays canonical for record content
 * (ADR-0020); Nexus provides discovery, ordering, and revision freshness.
 *
 * The projection does carry the sale terms a catalog card needs: the primary
 * price (the unit price for fixed-price listings, the starting price for
 * auctions) and, for auctions, the `auction_*` term fields. It never carries
 * live auction state (current bid, bid count) — bids live in the transaction
 * service's listing projection, not in the listing record Nexus indexes.
 */

export type NexusListingState = 'active' | 'paused' | 'ended' | 'removed';

export type NexusListingCondition = 'new' | 'like_new' | 'excellent' | 'good' | 'fair' | 'for_parts';

export type NexusListingSaleFormat = 'fixed_price' | 'auction';

export type NexusFulfillmentMethod = 'physical' | 'digital' | 'pickup';

export type NexusSortOrder = 'ascending' | 'descending';

/**
 * Property the listing stream is sorted by. `timeline` (the server default)
 * orders by indexing time; `ends_at` orders auction listings by auction end
 * time and excludes fixed-price listings entirely.
 */
export type NexusListingStreamSorting = 'timeline' | 'ends_at';

/**
 * One indexed listing as returned by `GET v0/stream/listings` and `GET v0/listing/{seller_id}/{listing_id}`.
 *
 * The five `auction_*` fields are the auction sale terms and are all `null`
 * for fixed-price listings. The `*_minor` amounts are minor units of the
 * listing's primary asset (`price_currency` / `price_exponent`). Auction
 * listings indexed before Nexus carried these fields serve `null` for all
 * five until re-indexed, so an auction row with null terms is a legal stale
 * state, not a protocol violation.
 */
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
  auction_starts_at: string | null;
  auction_ends_at: string | null;
  auction_reserve_price_minor: number | null;
  auction_buy_now_price_minor: number | null;
  auction_minimum_increment_minor: number | null;
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
 * `sorting=ends_at` returns only auction listings; combine with
 * `order=ascending` for an "ending soon" stream.
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
  sorting?: NexusListingStreamSorting;
  skip?: number;
  limit?: number;
  start?: number;
  end?: number;
};

/**
 * Query parameters for `GET v0/listing/{seller_id}/{listing_id}/tags`.
 * Mirrors the post tag endpoint's pagination/viewer contract
 * (`GET v0/post/{author}/{post}/tags`).
 */
export type TListingTagsParams = {
  seller_id: string;
  listing_id: string;
  limit_tags?: number;
  skip_tags?: number;
  viewer_id?: string;
};

/** Query parameters for `GET v0/shop/{seller_id}/tags`. */
export type TShopTagsParams = {
  seller_id: string;
  limit_tags?: number;
  skip_tags?: number;
  viewer_id?: string;
};

/** Path params excluded from tag endpoint query strings. */
export const MARKETPLACE_TAGS_PATH_PARAMS = ['seller_id', 'listing_id'];
