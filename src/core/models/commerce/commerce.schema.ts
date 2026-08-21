import type { CommerceListingRecord, CommerceShopRecord } from '@/libs/commerce/marketplace-records';
import type { AuctionState, CommerceJsonValue, CommerceMoney } from '@/libs/commerce/transaction-contracts';

export type CommerceCacheStatus = 'local' | 'pending' | 'synced' | 'failed';

export interface CommerceShopModelSchema {
  id: string;
  owner_id: string;
  record: CommerceShopRecord;
  revision: number;
  sync_status: CommerceCacheStatus;
  updated_at: number;
}

export const commerceShopTableSchema = '&id, revision, sync_status, updated_at';

export interface CommerceListingModelSchema {
  id: string;
  seller_id: string;
  listing_id: string;
  record: CommerceListingRecord;
  revision: number;
  state: CommerceListingRecord['state'];
  category_id: string;
  format: CommerceListingRecord['sale']['format'];
  currency: string;
  price_minor: number;
  sync_status: CommerceCacheStatus;
  updated_at: number;
}

export const commerceListingTableSchema = [
  '&id',
  'seller_id',
  'listing_id',
  'revision',
  'state',
  'category_id',
  'format',
  'currency',
  'price_minor',
  'sync_status',
  'updated_at',
  '[seller_id+state]',
  '[category_id+state]',
].join(', ');

/**
 * Auction sale terms as carried by the Nexus listing index. Money terms are
 * denominated in the listing's primary asset. `reservePrice` and
 * `buyNowPrice` are optional terms of the auction itself; the other three
 * are always present when the index knows the terms at all.
 */
export interface CommerceCatalogAuctionTerms {
  startsAt: string;
  endsAt: string;
  reservePrice: CommerceMoney | null;
  buyNowPrice: CommerceMoney | null;
  minimumIncrement: CommerceMoney;
}

/**
 * One discovered listing as projected by the Nexus marketplace index
 * (`GET v0/stream/listings`), cached locally so the catalog grid can render
 * without hydrating the owner-signed record from the seller's homeserver.
 *
 * This is a lossy discovery projection, never a substitute for the canonical
 * record (ADR-0020): it carries the record's media URIs (`media_urls`, enough
 * to render card images) but none of the per-media metadata (type, dimensions,
 * alt text), no variants, shipping options, or return policy, and no live
 * auction state (current bid, bid count) because bids are not part of the
 * listing record Nexus indexes.
 *
 * `auction` is `null` for fixed-price listings — and for auction listings
 * that Nexus indexed before it carried auction terms (stale index rows serve
 * null terms until re-indexed), so `sale_format === 'auction'` with a null
 * `auction` is a legal state the UI must render sanely.
 */
export interface CommerceCatalogEntryModelSchema {
  id: string;
  seller_id: string;
  listing_id: string;
  state: CommerceListingRecord['state'];
  title: string;
  description: string;
  category_id: string;
  condition: CommerceListingRecord['condition'];
  tags: string[];
  country_code: string;
  region: string | null;
  /** `pubky://.../marketplace/v1/media/<id>` URIs in record order (see `resolveMarketplaceMediaUrl`). */
  media_urls: string[];
  sale_format: CommerceListingRecord['sale']['format'];
  price: CommerceMoney;
  auction: CommerceCatalogAuctionTerms | null;
  revision: number;
  updated_at: number;
}

export const commerceCatalogEntryTableSchema = [
  '&id',
  'seller_id',
  'state',
  'sale_format',
  'revision',
  'updated_at',
  '[seller_id+state]',
].join(', ');

export type CommerceListingDraftData = Pick<CommerceListingRecord, 'listingId' | 'ownerPubky'> &
  Partial<
    Omit<
      CommerceListingRecord,
      'schemaVersion' | 'recordType' | 'listingId' | 'ownerPubky' | 'revision' | 'createdAt' | 'updatedAt' | 'state'
    >
  > & {
    form?: CommerceJsonValue;
  };

export interface CommerceListingDraftModelSchema {
  id: string;
  owner_id: string;
  listing_id: string;
  data: CommerceListingDraftData;
  created_at: number;
  updated_at: number;
}

export const commerceListingDraftTableSchema = '&id, owner_id, listing_id, updated_at, [owner_id+updated_at]';

export type CommerceListingProjectionState = 'available' | 'reserved' | 'sold' | 'ended' | 'suspended';

export interface CommerceListingProjectionModelSchema {
  id: string;
  seller_id: string;
  listing_id: string;
  listing_revision: number;
  content_hash: string;
  server_revision: number;
  state: CommerceListingProjectionState;
  available_quantity: number;
  current_price: CommerceMoney;
  auction_state: AuctionState | null;
  bid_count: number;
  sync_status: Exclude<CommerceCacheStatus, 'local'>;
  synced_at: number;
}

export const commerceListingProjectionTableSchema = [
  '&id',
  'seller_id',
  'listing_id',
  'listing_revision',
  'server_revision',
  'state',
  'auction_state',
  'sync_status',
  'synced_at',
  '[seller_id+state]',
].join(', ');

export type CommerceSyncJobOperation = 'publish' | 'update' | 'remove';
export type CommerceSyncJobStatus = 'pending' | 'running' | 'failed';

export interface CommerceSyncJobModelSchema {
  id: string;
  owner_id: string;
  entity_type: 'shop' | 'listing' | 'review' | 'collection';
  entity_id: string;
  operation: CommerceSyncJobOperation;
  status: CommerceSyncJobStatus;
  attempts: number;
  next_attempt_at: number;
  last_error_code: string | null;
  payload: CommerceJsonValue;
  created_at: number;
  updated_at: number;
}

export const commerceSyncJobTableSchema = [
  '&id',
  'owner_id',
  'entity_type',
  'entity_id',
  'operation',
  'status',
  'next_attempt_at',
  'updated_at',
  '[owner_id+status]',
].join(', ');

export interface CommerceFavoriteModelSchema {
  id: string;
  owner_id: string;
  listing_id: string;
  created_at: number;
}

export const commerceFavoriteTableSchema = '&id, owner_id, listing_id, created_at, [owner_id+created_at]';

export interface CommerceShopFollowModelSchema {
  id: string;
  owner_id: string;
  seller_id: string;
  created_at: number;
}

export const commerceShopFollowTableSchema = '&id, owner_id, seller_id, created_at, [owner_id+created_at]';

export interface CommerceCartItemModelSchema {
  id: string;
  owner_id: string;
  listing_id: string;
  variant_id: string;
  quantity: number;
  added_at: number;
  updated_at: number;
}

export const commerceCartItemTableSchema = '&id, owner_id, listing_id, variant_id, updated_at, [owner_id+updated_at]';

/**
 * The buyer's private record of a real Locks payment: the correlation between
 * a transaction-service payment and the Locks verification lifecycle the
 * buyer opened for it (`locks-paykit` mode).
 *
 * `bundle_id` is BEARER MATERIAL — whoever holds it can look up the lifecycle
 * and, once completed, obtain the content access credential. It therefore
 * lives only in this account-scoped table (never in public records, command
 * results, logs, or telemetry) and exists so the flow is resumable after a
 * reload: the payment status itself is re-read from the transaction service,
 * while the persisted bundle id lets the buyer retry a failed registration
 * and unlock the purchased content after confirmation.
 */
export interface CommerceLocksCorrelationModelSchema {
  /** `${owner_id}:${payment_id}` */
  id: string;
  owner_id: string;
  payment_id: string;
  order_id: string;
  seller_pubky: string;
  bundle_id: string;
  /** Public Locks policy URI (`pubky://<creator>/pub/locks.app/<lock>.json`). */
  policy_uri: string;
  criterion_id: string;
  /** Guarded content path for the Lock Server proxy read, from the listing record. */
  content_path: string;
  /** Expected lowercase BLAKE3 hash of the guarded bytes, from the listing record. */
  resource_hash: string;
  /**
   * Marketplace payment window deadline reported by `payment.register_locks`,
   * bounding the client's status polling. Null until registration succeeds.
   */
  window_expires_at: string | null;
  /** True once `payment.register_locks` was accepted by the transaction service. */
  registered: boolean;
  created_at: number;
  updated_at: number;
}

export const commerceLocksCorrelationTableSchema = '&id, owner_id, payment_id, order_id, updated_at';
