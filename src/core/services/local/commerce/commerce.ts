import { db } from '@/database/franky/franky';
import type { CommerceListingRecord, CommerceShopRecord } from '@/libs/commerce/marketplace-records';
import { DatabaseErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import {
  CommerceCartItemModel,
  CommerceCatalogEntryModel,
  CommerceFavoriteModel,
  CommerceListingDraftModel,
  CommerceListingModel,
  CommerceListingProjectionModel,
  CommerceLocksCorrelationModel,
  CommerceReviewModel,
  CommerceShopFollowModel,
  CommerceShopModel,
  CommerceSyncJobModel,
} from '@/models/commerce/commerce.models';
import type {
  CommerceCacheStatus,
  CommerceCatalogEntryModelSchema,
  CommerceListingDraftData,
  CommerceListingDraftModelSchema,
  CommerceListingModelSchema,
  CommerceListingProjectionModelSchema,
  CommerceLocksCorrelationModelSchema,
  CommerceReviewModelSchema,
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

  static async isFavorite(ownerId: string, listingId: string): Promise<boolean> {
    return await CommerceFavoriteModel.exists(this.favoriteId(ownerId, listingId));
  }

  static async getCartItems(ownerId: string) {
    return await CommerceCartItemModel.findByOwner(ownerId);
  }

  static async upsertCartItem(
    ownerId: string,
    listingId: string,
    variantId: string,
    quantity: number,
    now: number,
  ): Promise<void> {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Cart quantity must be a positive safe integer.', {
        service: ErrorService.Local,
        operation: 'upsertCartItem',
        context: { quantity },
      });
    }
    const listing = await CommerceListingModel.findById(listingId);
    const variant = listing?.record.variants.find(({ id, enabled }) => id === variantId && enabled);
    if (!listing || !variant || quantity > variant.quantity) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Cart item is unavailable in the requested quantity.', {
        service: ErrorService.Local,
        operation: 'upsertCartItem',
        context: { listingFound: Boolean(listing), variantFound: Boolean(variant), quantity },
      });
    }
    const id = this.cartItemId(ownerId, listingId, variantId);
    const current = await CommerceCartItemModel.findById(id);
    await CommerceCartItemModel.upsert({
      id,
      owner_id: ownerId,
      listing_id: listingId,
      variant_id: variantId,
      quantity,
      added_at: current?.added_at ?? now,
      updated_at: now,
    });
  }

  static async deleteCartItem(ownerId: string, listingId: string, variantId: string): Promise<void> {
    await CommerceCartItemModel.deleteById(this.cartItemId(ownerId, listingId, variantId));
  }

  static async clearCart(ownerId: string): Promise<void> {
    try {
      await CommerceCartItemModel.table.where('owner_id').equals(ownerId).delete();
    } catch (error) {
      throw Err.database(DatabaseErrorCode.DELETE_FAILED, 'Failed to clear commerce cart', {
        service: ErrorService.Local,
        operation: 'clearCart',
        context: { table: CommerceCartItemModel.table.name },
        cause: error,
      });
    }
  }

  static async getFavorites(ownerId: string) {
    return await CommerceFavoriteModel.findByOwner(ownerId);
  }

  static async createFavorite(ownerId: string, listingId: string, now: number): Promise<void> {
    await CommerceFavoriteModel.upsert({
      id: this.favoriteId(ownerId, listingId),
      owner_id: ownerId,
      listing_id: listingId,
      created_at: now,
    });
  }

  static async deleteFavorite(ownerId: string, listingId: string): Promise<void> {
    await CommerceFavoriteModel.deleteById(this.favoriteId(ownerId, listingId));
  }

  static async isShopFollowed(ownerId: string, sellerId: string): Promise<boolean> {
    return await CommerceShopFollowModel.exists(this.shopFollowId(ownerId, sellerId));
  }

  static async getShopFollows(ownerId: string) {
    return await CommerceShopFollowModel.findByOwner(ownerId);
  }

  static async createShopFollow(ownerId: string, sellerId: string, now: number): Promise<void> {
    await CommerceShopFollowModel.upsert({
      id: this.shopFollowId(ownerId, sellerId),
      owner_id: ownerId,
      seller_id: sellerId,
      created_at: now,
    });
  }

  static async deleteShopFollow(ownerId: string, sellerId: string): Promise<void> {
    await CommerceShopFollowModel.deleteById(this.shopFollowId(ownerId, sellerId));
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

  static async getCatalogEntry(compositeListingId: string) {
    return await CommerceCatalogEntryModel.findById(compositeListingId);
  }

  static async getAllCatalogEntries(): Promise<CommerceCatalogEntryModelSchema[]> {
    return await CommerceCatalogEntryModel.findAllSorted();
  }

  static async getCatalogEntriesBySeller(sellerId: string): Promise<CommerceCatalogEntryModelSchema[]> {
    return await CommerceCatalogEntryModel.findBySeller(sellerId);
  }

  static async bulkUpsertCatalogEntries(entries: CommerceCatalogEntryModelSchema[]): Promise<void> {
    await CommerceCatalogEntryModel.bulkSave(entries);
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

  /**
   * Removes a listing from every local surface at once: the canonical record
   * cache, the transaction-service projection cache, and the Nexus discovery
   * cache — so a seller's deleted listing disappears from the catalog grid
   * immediately instead of waiting for the index to re-sync.
   */
  static async deleteListing(compositeListingId: string): Promise<void> {
    try {
      await db.transaction(
        'rw',
        CommerceListingModel.table,
        CommerceListingProjectionModel.table,
        CommerceCatalogEntryModel.table,
        async () => {
          await CommerceListingModel.table.delete(compositeListingId);
          await CommerceListingProjectionModel.table.delete(compositeListingId);
          await CommerceCatalogEntryModel.table.delete(compositeListingId);
        },
      );
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.DELETE_FAILED, 'Failed to delete the local listing caches', {
        service: ErrorService.Local,
        operation: 'deleteListing',
        context: {
          tables: [
            CommerceListingModel.table.name,
            CommerceListingProjectionModel.table.name,
            CommerceCatalogEntryModel.table.name,
          ],
        },
        cause: error,
      });
    }
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

  static async getOwnReviewById(compositeReviewId: string): Promise<CommerceReviewModelSchema | undefined> {
    return (await CommerceReviewModel.findById(compositeReviewId)) ?? undefined;
  }

  static async getOwnReviewByOrder(ownerId: string, orderId: string): Promise<CommerceReviewModelSchema | undefined> {
    return await CommerceReviewModel.findByOwnerAndOrder(ownerId, orderId);
  }

  static async getPendingOwnReviews(ownerId: string): Promise<CommerceReviewModelSchema[]> {
    return await CommerceReviewModel.findPendingByOwner(ownerId);
  }

  static async upsertOwnReview(review: CommerceReviewModelSchema): Promise<void> {
    await CommerceReviewModel.upsert(review);
  }

  /**
   * Stages an own-review publication: the local-first row (status `pending`)
   * and its sync job land in one transaction, so an interrupted publication
   * is visible and retryable rather than silently lost — the same retryable
   * pattern listing publication established.
   */
  static async stageOwnReviewSync(review: CommerceReviewModelSchema, job: CommerceSyncJobModelSchema): Promise<void> {
    this.assertSyncJobIdentity(job, review.owner_id, review.review_id, 'review');
    try {
      await db.transaction('rw', CommerceReviewModel.table, CommerceSyncJobModel.table, async () => {
        await CommerceReviewModel.upsert(review);
        await CommerceSyncJobModel.upsert(job);
      });
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to stage review synchronization', {
        service: ErrorService.Local,
        operation: 'stageOwnReviewSync',
        context: { tables: [CommerceReviewModel.table.name, CommerceSyncJobModel.table.name] },
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

  static async upsertSyncJob(job: CommerceSyncJobModelSchema): Promise<void> {
    await CommerceSyncJobModel.upsert(job);
  }

  static async completeSyncJob(id: string): Promise<void> {
    await CommerceSyncJobModel.deleteById(id);
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

  /**
   * The buyer's private Locks payment correlation (see
   * `CommerceLocksCorrelationModelSchema` — the bundle id it carries is
   * bearer material and stays in this account-scoped table only).
   */
  static async getLocksCorrelation(ownerId: string, paymentId: string) {
    return await CommerceLocksCorrelationModel.findById(this.locksCorrelationId(ownerId, paymentId));
  }

  static async upsertLocksCorrelation(correlation: Omit<CommerceLocksCorrelationModelSchema, 'id'>): Promise<void> {
    await CommerceLocksCorrelationModel.upsert({
      ...correlation,
      id: this.locksCorrelationId(correlation.owner_id, correlation.payment_id),
    });
  }

  static async markLocksCorrelationRegistered(
    ownerId: string,
    paymentId: string,
    windowExpiresAt: string | null,
    now: number,
  ): Promise<void> {
    const current = await CommerceLocksCorrelationModel.findById(this.locksCorrelationId(ownerId, paymentId));
    if (!current) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'No Locks correlation exists for this payment.', {
        service: ErrorService.Local,
        operation: 'markLocksCorrelationRegistered',
      });
    }
    await CommerceLocksCorrelationModel.upsert({
      ...current,
      registered: true,
      window_expires_at: windowExpiresAt,
      updated_at: now,
    });
  }

  private static locksCorrelationId(ownerId: string, paymentId: string): string {
    return `${ownerId}|${paymentId}`;
  }

  private static favoriteId(ownerId: string, listingId: string): string {
    return `${ownerId}|${listingId}`;
  }

  private static shopFollowId(ownerId: string, sellerId: string): string {
    return `${ownerId}|${sellerId}`;
  }

  private static cartItemId(ownerId: string, listingId: string, variantId: string): string {
    return `${ownerId}|${listingId}|${variantId}`;
  }
}
