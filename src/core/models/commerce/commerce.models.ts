import type { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { RecordModelBase } from '@/models/shared/base/record/baseRecord';
import type {
  CommerceListingDraftModelSchema,
  CommerceListingModelSchema,
  CommerceListingProjectionModelSchema,
  CommerceShopModelSchema,
  CommerceSyncJobModelSchema,
} from './commerce.schema';

export class CommerceShopModel
  extends RecordModelBase<string, CommerceShopModelSchema>
  implements CommerceShopModelSchema
{
  static table: Table<CommerceShopModelSchema> = db.table('commerce_shops');

  owner_id: string;
  record: CommerceShopModelSchema['record'];
  revision: number;
  sync_status: CommerceShopModelSchema['sync_status'];
  updated_at: number;

  constructor(shop: CommerceShopModelSchema) {
    super(shop);
    this.owner_id = shop.owner_id;
    this.record = shop.record;
    this.revision = shop.revision;
    this.sync_status = shop.sync_status;
    this.updated_at = shop.updated_at;
  }

  static async findAllSorted(): Promise<CommerceShopModelSchema[]> {
    try {
      return await this.table.orderBy('updated_at').reverse().toArray();
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to read sorted records from ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'findAllSorted',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }
}

export class CommerceListingModel
  extends RecordModelBase<string, CommerceListingModelSchema>
  implements CommerceListingModelSchema
{
  static table: Table<CommerceListingModelSchema> = db.table('commerce_listings');

  seller_id: string;
  listing_id: string;
  record: CommerceListingModelSchema['record'];
  revision: number;
  state: CommerceListingModelSchema['state'];
  category_id: string;
  format: CommerceListingModelSchema['format'];
  currency: string;
  price_minor: number;
  sync_status: CommerceListingModelSchema['sync_status'];
  updated_at: number;

  constructor(listing: CommerceListingModelSchema) {
    super(listing);
    this.seller_id = listing.seller_id;
    this.listing_id = listing.listing_id;
    this.record = listing.record;
    this.revision = listing.revision;
    this.state = listing.state;
    this.category_id = listing.category_id;
    this.format = listing.format;
    this.currency = listing.currency;
    this.price_minor = listing.price_minor;
    this.sync_status = listing.sync_status;
    this.updated_at = listing.updated_at;
  }

  static async findBySeller(sellerId: string): Promise<CommerceListingModelSchema[]> {
    return await this.findAndSort('seller_id', sellerId);
  }

  static async findByCategory(categoryId: string): Promise<CommerceListingModelSchema[]> {
    return await this.findAndSort('category_id', categoryId);
  }

  static async findAllSorted(): Promise<CommerceListingModelSchema[]> {
    try {
      return await this.table.orderBy('updated_at').reverse().toArray();
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to read sorted records from ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'findAllSorted',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }

  private static async findAndSort(index: 'seller_id' | 'category_id', value: string) {
    try {
      const listings = await this.table.where(index).equals(value).toArray();
      return listings.sort((left, right) => right.updated_at - left.updated_at);
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to query ${this.table.name} by ${index}`, {
        service: ErrorService.Local,
        operation: 'findAndSort',
        context: { table: this.table.name, index },
        cause: error,
      });
    }
  }
}

export class CommerceListingDraftModel
  extends RecordModelBase<string, CommerceListingDraftModelSchema>
  implements CommerceListingDraftModelSchema
{
  static table: Table<CommerceListingDraftModelSchema> = db.table('commerce_listing_drafts');

  owner_id: string;
  listing_id: string;
  data: CommerceListingDraftModelSchema['data'];
  created_at: number;
  updated_at: number;

  constructor(draft: CommerceListingDraftModelSchema) {
    super(draft);
    this.owner_id = draft.owner_id;
    this.listing_id = draft.listing_id;
    this.data = draft.data;
    this.created_at = draft.created_at;
    this.updated_at = draft.updated_at;
  }

  static async findByOwner(ownerId: string): Promise<CommerceListingDraftModelSchema[]> {
    try {
      const drafts = await this.table.where('owner_id').equals(ownerId).toArray();
      return drafts.sort((left, right) => right.updated_at - left.updated_at);
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to query ${this.table.name} by owner`, {
        service: ErrorService.Local,
        operation: 'findByOwner',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }
}

export class CommerceListingProjectionModel
  extends RecordModelBase<string, CommerceListingProjectionModelSchema>
  implements CommerceListingProjectionModelSchema
{
  static table: Table<CommerceListingProjectionModelSchema> = db.table('commerce_listing_projections');

  seller_id: string;
  listing_id: string;
  listing_revision: number;
  content_hash: string;
  server_revision: number;
  state: CommerceListingProjectionModelSchema['state'];
  available_quantity: number;
  current_price: CommerceListingProjectionModelSchema['current_price'];
  auction_state: CommerceListingProjectionModelSchema['auction_state'];
  bid_count: number;
  sync_status: CommerceListingProjectionModelSchema['sync_status'];
  synced_at: number;

  constructor(projection: CommerceListingProjectionModelSchema) {
    super(projection);
    this.seller_id = projection.seller_id;
    this.listing_id = projection.listing_id;
    this.listing_revision = projection.listing_revision;
    this.content_hash = projection.content_hash;
    this.server_revision = projection.server_revision;
    this.state = projection.state;
    this.available_quantity = projection.available_quantity;
    this.current_price = projection.current_price;
    this.auction_state = projection.auction_state;
    this.bid_count = projection.bid_count;
    this.sync_status = projection.sync_status;
    this.synced_at = projection.synced_at;
  }
}

export class CommerceSyncJobModel
  extends RecordModelBase<string, CommerceSyncJobModelSchema>
  implements CommerceSyncJobModelSchema
{
  static table: Table<CommerceSyncJobModelSchema> = db.table('commerce_sync_jobs');

  owner_id: string;
  entity_type: CommerceSyncJobModelSchema['entity_type'];
  entity_id: string;
  operation: CommerceSyncJobModelSchema['operation'];
  status: CommerceSyncJobModelSchema['status'];
  attempts: number;
  next_attempt_at: number;
  last_error_code: string | null;
  payload: CommerceSyncJobModelSchema['payload'];
  created_at: number;
  updated_at: number;

  constructor(job: CommerceSyncJobModelSchema) {
    super(job);
    this.owner_id = job.owner_id;
    this.entity_type = job.entity_type;
    this.entity_id = job.entity_id;
    this.operation = job.operation;
    this.status = job.status;
    this.attempts = job.attempts;
    this.next_attempt_at = job.next_attempt_at;
    this.last_error_code = job.last_error_code;
    this.payload = job.payload;
    this.created_at = job.created_at;
    this.updated_at = job.updated_at;
  }

  static async findReady(ownerId: string, now: number, limit: number): Promise<CommerceSyncJobModelSchema[]> {
    try {
      const jobs = await this.table.where('[owner_id+status]').equals([ownerId, 'pending']).toArray();
      return jobs
        .filter(({ next_attempt_at }) => next_attempt_at <= now)
        .sort((left, right) => left.next_attempt_at - right.next_attempt_at)
        .slice(0, limit);
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to read ready jobs from ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'findReady',
        context: { table: this.table.name, limit },
        cause: error,
      });
    }
  }
}
