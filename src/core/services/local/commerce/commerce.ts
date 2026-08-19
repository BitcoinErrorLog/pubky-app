import { db } from '@/database/franky/franky';
import type { CommerceListingRecord, CommerceShopRecord } from '@/libs/commerce/marketplace-records';
import { DatabaseErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import {
  CommerceListingDraftModel,
  CommerceListingModel,
  CommerceListingProjectionModel,
  CommerceShopModel,
  CommerceSyncJobModel,
} from '@/models/commerce/commerce.models';
import type {
  CommerceCacheStatus,
  CommerceListingDraftData,
  CommerceListingDraftModelSchema,
  CommerceListingModelSchema,
  CommerceListingProjectionModelSchema,
  CommerceShopModelSchema,
  CommerceSyncJobModelSchema,
} from '@/models/commerce/commerce.schema';

export class LocalCommerceService {
  private constructor() {}

  static async getShop(ownerId: string) {
    return await CommerceShopModel.findById(ownerId);
  }

  static async getAllShops(): Promise<CommerceShopModelSchema[]> {
    return await CommerceShopModel.findAllSorted();
  }

  static async upsertShop(record: CommerceShopRecord, syncStatus: CommerceCacheStatus): Promise<void> {
    await CommerceShopModel.upsert({
      id: record.ownerPubky,
      owner_id: record.ownerPubky,
      record,
      revision: record.revision,
      sync_status: syncStatus,
      updated_at: Date.parse(record.updatedAt),
    });
  }

  static async stageShopSync(record: CommerceShopRecord, job: CommerceSyncJobModelSchema): Promise<void> {
    this.assertSyncJobIdentity(job, record.ownerPubky, record.ownerPubky, 'shop');
    const shop = {
      id: record.ownerPubky,
      owner_id: record.ownerPubky,
      record,
      revision: record.revision,
      sync_status: 'pending' as const,
      updated_at: Date.parse(record.updatedAt),
    };

    try {
      await db.transaction('rw', CommerceShopModel.table, CommerceSyncJobModel.table, async () => {
        await CommerceShopModel.upsert(shop);
        await CommerceSyncJobModel.upsert(job);
      });
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to stage shop synchronization', {
        service: ErrorService.Local,
        operation: 'stageShopSync',
        context: { tables: [CommerceShopModel.table.name, CommerceSyncJobModel.table.name] },
        cause: error,
      });
    }
  }

  static async getListing(compositeListingId: string) {
    return await CommerceListingModel.findById(compositeListingId);
  }

  static async getListingsBySeller(sellerId: string): Promise<CommerceListingModelSchema[]> {
    return await CommerceListingModel.findBySeller(sellerId);
  }

  static async getListingsByCategory(categoryId: string): Promise<CommerceListingModelSchema[]> {
    return await CommerceListingModel.findByCategory(categoryId);
  }

  static async getAllListings(): Promise<CommerceListingModelSchema[]> {
    return await CommerceListingModel.findAllSorted();
  }

  static async upsertListing(record: CommerceListingRecord, syncStatus: CommerceCacheStatus): Promise<void> {
    await CommerceListingModel.upsert(this.toListingModel(record, syncStatus));
  }

  static async stageListingSync(record: CommerceListingRecord, job: CommerceSyncJobModelSchema): Promise<void> {
    this.assertSyncJobIdentity(job, record.ownerPubky, record.listingId, 'listing');
    const listing = this.toListingModel(record, 'pending');

    try {
      await db.transaction('rw', CommerceListingModel.table, CommerceSyncJobModel.table, async () => {
        await CommerceListingModel.upsert(listing);
        await CommerceSyncJobModel.upsert(job);
      });
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to stage listing synchronization', {
        service: ErrorService.Local,
        operation: 'stageListingSync',
        context: { tables: [CommerceListingModel.table.name, CommerceSyncJobModel.table.name] },
        cause: error,
      });
    }
  }

  static async upsertListingAndProjection(
    record: CommerceListingRecord,
    syncStatus: CommerceCacheStatus,
    projection: CommerceListingProjectionModelSchema,
  ): Promise<void> {
    const listing = this.toListingModel(record, syncStatus);
    if (listing.id !== projection.id || listing.revision !== projection.listing_revision) {
      throw Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Listing projection must match the public listing identity and revision.',
        {
          service: ErrorService.Local,
          operation: 'upsertListingAndProjection',
          context: {
            identityMatches: listing.id === projection.id,
            revisionMatches: listing.revision === projection.listing_revision,
          },
        },
      );
    }

    try {
      await db.transaction('rw', CommerceListingModel.table, CommerceListingProjectionModel.table, async () => {
        await CommerceListingModel.upsert(listing);
        await CommerceListingProjectionModel.upsert(projection);
      });
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to persist listing and projection atomically', {
        service: ErrorService.Local,
        operation: 'upsertListingAndProjection',
        context: { tables: [CommerceListingModel.table.name, CommerceListingProjectionModel.table.name] },
        cause: error,
      });
    }
  }

  static async seedSandboxCatalog({
    shops,
    listings,
    projections,
  }: {
    shops: CommerceShopRecord[];
    listings: CommerceListingRecord[];
    projections: CommerceListingProjectionModelSchema[];
  }): Promise<boolean> {
    try {
      return await db.transaction(
        'rw',
        CommerceShopModel.table,
        CommerceListingModel.table,
        CommerceListingProjectionModel.table,
        async () => {
          if ((await CommerceListingModel.table.count()) > 0) return false;

          const shopModels: CommerceShopModelSchema[] = shops.map((record) => ({
            id: record.ownerPubky,
            owner_id: record.ownerPubky,
            record,
            revision: record.revision,
            sync_status: 'synced',
            updated_at: Date.parse(record.updatedAt),
          }));
          const listingModels = listings.map((record) => this.toListingModel(record, 'synced'));
          const listingRevisions = new Map(listingModels.map(({ id, revision }) => [id, revision]));
          const projectionsMatch = projections.every(
            ({ id, listing_revision }) => listingRevisions.get(id) === listing_revision,
          );
          if (!projectionsMatch) {
            throw Err.validation(
              ValidationErrorCode.INVALID_INPUT,
              'Sandbox projections must match their listing identities and revisions.',
              {
                service: ErrorService.Local,
                operation: 'seedSandboxCatalog',
              },
            );
          }

          await CommerceShopModel.bulkSave(shopModels);
          await CommerceListingModel.bulkSave(listingModels);
          await CommerceListingProjectionModel.bulkSave(projections);
          return true;
        },
      );
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to seed the sandbox marketplace catalog', {
        service: ErrorService.Local,
        operation: 'seedSandboxCatalog',
        context: {
          tables: [
            CommerceShopModel.table.name,
            CommerceListingModel.table.name,
            CommerceListingProjectionModel.table.name,
          ],
        },
        cause: error,
      });
    }
  }

  static async getListingProjection(compositeListingId: string) {
    return await CommerceListingProjectionModel.findById(compositeListingId);
  }

  static async getDraft(compositeListingId: string) {
    return await CommerceListingDraftModel.findById(compositeListingId);
  }

  static async getDraftsByOwner(ownerId: string): Promise<CommerceListingDraftModelSchema[]> {
    return await CommerceListingDraftModel.findByOwner(ownerId);
  }

  static async upsertDraft({
    ownerId,
    listingId,
    data,
    now,
  }: {
    ownerId: string;
    listingId: string;
    data: CommerceListingDraftData;
    now: number;
  }): Promise<void> {
    if (data.ownerPubky !== ownerId || data.listingId !== listingId) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Draft identity must match its account and listing.', {
        service: ErrorService.Local,
        operation: 'upsertDraft',
        context: {
          ownerMatches: data.ownerPubky === ownerId,
          listingMatches: data.listingId === listingId,
        },
      });
    }
    const id = `${ownerId}:${listingId}`;
    const existing = await CommerceListingDraftModel.findById(id);
    await CommerceListingDraftModel.upsert({
      id,
      owner_id: ownerId,
      listing_id: listingId,
      data,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
  }

  static async deleteDraft(compositeListingId: string): Promise<void> {
    await CommerceListingDraftModel.deleteById(compositeListingId);
  }

  static async enqueueSyncJob(job: CommerceSyncJobModelSchema): Promise<void> {
    await CommerceSyncJobModel.upsert(job);
  }

  static async claimReadySyncJobs(ownerId: string, now: number, limit: number): Promise<CommerceSyncJobModelSchema[]> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Sync job claim limit must be a positive safe integer.', {
        service: ErrorService.Local,
        operation: 'claimReadySyncJobs',
        context: { limit },
      });
    }

    try {
      return await db.transaction('rw', CommerceSyncJobModel.table, async () => {
        const jobs = await CommerceSyncJobModel.findReady(ownerId, now, limit);
        const claimed = jobs.map((job) => ({
          ...job,
          status: 'running' as const,
          attempts: job.attempts + 1,
          updated_at: now,
        }));
        await CommerceSyncJobModel.bulkSave(claimed);
        return claimed;
      });
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to claim commerce sync jobs', {
        service: ErrorService.Local,
        operation: 'claimReadySyncJobs',
        context: { table: CommerceSyncJobModel.table.name, limit },
        cause: error,
      });
    }
  }

  static async rescheduleSyncJob({
    id,
    errorCode,
    nextAttemptAt,
    now,
  }: {
    id: string;
    errorCode: string;
    nextAttemptAt: number;
    now: number;
  }): Promise<void> {
    await CommerceSyncJobModel.update(id, {
      status: 'pending',
      last_error_code: errorCode,
      next_attempt_at: nextAttemptAt,
      updated_at: now,
    });
  }

  static async failSyncJob(id: string, errorCode: string, now: number): Promise<void> {
    await CommerceSyncJobModel.update(id, {
      status: 'failed',
      last_error_code: errorCode,
      updated_at: now,
    });
  }

  static async completeSyncJob(id: string): Promise<void> {
    await CommerceSyncJobModel.deleteById(id);
  }

  static async resetRunningSyncJobs(ownerId: string, now: number): Promise<void> {
    try {
      await CommerceSyncJobModel.table
        .where('[owner_id+status]')
        .equals([ownerId, 'running'])
        .modify({ status: 'pending', next_attempt_at: now, updated_at: now });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to reset interrupted commerce sync jobs', {
        service: ErrorService.Local,
        operation: 'resetRunningSyncJobs',
        context: { table: CommerceSyncJobModel.table.name },
        cause: error,
      });
    }
  }

  private static toListingModel(
    record: CommerceListingRecord,
    syncStatus: CommerceCacheStatus,
  ): CommerceListingModelSchema {
    const price = record.sale.format === 'fixed_price' ? record.sale.unitPrice : record.sale.startingPrice;
    return {
      id: `${record.ownerPubky}:${record.listingId}`,
      seller_id: record.ownerPubky,
      listing_id: record.listingId,
      record,
      revision: record.revision,
      state: record.state,
      category_id: record.categoryId,
      format: record.sale.format,
      currency: price.currency,
      price_minor: price.amountMinor,
      sync_status: syncStatus,
      updated_at: Date.parse(record.updatedAt),
    };
  }

  private static assertSyncJobIdentity(
    job: CommerceSyncJobModelSchema,
    ownerId: string,
    entityId: string,
    entityType: CommerceSyncJobModelSchema['entity_type'],
  ): void {
    const ownerMatches = job.owner_id === ownerId;
    const entityMatches = job.entity_id === entityId;
    const typeMatches = job.entity_type === entityType;
    if (!ownerMatches || !entityMatches || !typeMatches) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Sync job identity must match its public record.', {
        service: ErrorService.Local,
        operation: 'assertSyncJobIdentity',
        context: { ownerMatches, entityMatches, typeMatches },
      });
    }
  }
}
