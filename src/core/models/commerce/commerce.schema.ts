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

export type CommerceSyncJobOperation = 'publish' | 'register' | 'update' | 'remove';
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
