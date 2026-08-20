import { getCommerceAdapterMode } from '@/config/commerce';
import type { CommerceListingRecord, CommerceShopRecord } from '@/libs/commerce/marketplace-records';
import { createCommerceSandboxCatalog } from '@/libs/commerce/sandbox-catalog';
import { buildMarketplaceListingAggregateId, type MarketplaceCommand } from '@/libs/commerce/transaction-commands';
import type { CommerceJsonValue } from '@/libs/commerce/transaction-contracts';
import type { CommerceSyncJobModelSchema } from '@/models/commerce/commerce.schema';
import { CommerceRecordNormalizer } from '@/pipes/commerce/commerce.normalizer';
import { CommerceHomeserverService } from '@/services/homeserver/commerce/commerce';
import { LocksGatewayService } from '@/services/locks/locks';
import { LocalCommerceService } from '@/services/local/commerce/commerce';
import { MarketplaceGatewayService } from '@/services/marketplace/marketplace';

export class CommerceApplication {
  private constructor() {}

  static async getShop(ownerPubky: string) {
    return await LocalCommerceService.getShop(ownerPubky);
  }

  static async getAllShops() {
    return await LocalCommerceService.getAllShops();
  }

  static async fetchShop(ownerPubky: string): Promise<CommerceShopRecord> {
    const url = CommerceRecordNormalizer.shopUri(ownerPubky);
    return CommerceRecordNormalizer.shop(await CommerceHomeserverService.fetchJson(url));
  }

  static async getOrFetchShop(ownerPubky: string): Promise<CommerceShopRecord> {
    const local = await LocalCommerceService.getShop(ownerPubky);
    if (local) return local.record;

    const record = await this.fetchShop(ownerPubky);
    await LocalCommerceService.upsertShop(record, 'synced');
    return record;
  }

  static async getListing(compositeListingId: string) {
    return await LocalCommerceService.getListing(compositeListingId);
  }

  static async getListingsBySeller(sellerPubky: string) {
    return await LocalCommerceService.getListingsBySeller(sellerPubky);
  }

  static async getListingsByCategory(categoryId: string) {
    return await LocalCommerceService.getListingsByCategory(categoryId);
  }

  static async getAllListings() {
    return await LocalCommerceService.getAllListings();
  }

  static async getListingDrafts(ownerPubky: string) {
    return await LocalCommerceService.getDraftsByOwner(ownerPubky);
  }

  static async commitUpdateListingDraft(ownerPubky: string, listingId: string, form: CommerceJsonValue): Promise<void> {
    await LocalCommerceService.upsertDraft({
      ownerId: ownerPubky,
      listingId,
      data: { ownerPubky, listingId, form },
      now: Date.now(),
    });
  }

  static async commitDeleteListingDraft(ownerPubky: string, listingId: string): Promise<void> {
    await LocalCommerceService.deleteDraft(`${ownerPubky}:${listingId}`);
  }

  static async initializeSandboxCatalog(): Promise<boolean> {
    if (getCommerceAdapterMode() !== 'sandbox') return false;
    const catalog = createCommerceSandboxCatalog();
    const seeded = await LocalCommerceService.seedSandboxCatalog(catalog);
    await Promise.allSettled(catalog.listings.map((listing) => this.registerSandboxListing(listing)));
    return seeded;
  }

  static async executeMarketplaceCommand(actorPubky: string, command: MarketplaceCommand) {
    return await MarketplaceGatewayService.execute(actorPubky, command);
  }

  static async getMarketplaceListingProjection(aggregateId: string) {
    return await MarketplaceGatewayService.getListing(aggregateId);
  }

  static async getMarketplaceConversations(actorPubky: string) {
    return await MarketplaceGatewayService.getConversations(actorPubky);
  }

  static async getMarketplaceOffers(actorPubky: string) {
    return await MarketplaceGatewayService.getOffers(actorPubky);
  }

  static async getMarketplaceNotifications(actorPubky: string) {
    return await MarketplaceGatewayService.getNotifications(actorPubky);
  }

  static async getMarketplaceNotificationPreferences(actorPubky: string) {
    return await MarketplaceGatewayService.getNotificationPreferences(actorPubky);
  }

  static async getMarketplaceOrders(actorPubky: string) {
    return await MarketplaceGatewayService.getOrders(actorPubky);
  }

  static async getMarketplacePayment(actorPubky: string, paymentId: string) {
    return await MarketplaceGatewayService.getPayment(actorPubky, paymentId);
  }

  static async getMarketplaceReceipt(actorPubky: string, receiptId: string) {
    return await MarketplaceGatewayService.getReceipt(actorPubky, receiptId);
  }

  static async uploadMarketplaceAttachment(actorPubky: string, recipientPubky: string, file: File) {
    return await MarketplaceGatewayService.uploadAttachment(actorPubky, recipientPubky, file);
  }

  static async fetchMarketplaceAttachment(actorPubky: string, attachmentId: string) {
    return await MarketplaceGatewayService.fetchAttachment(actorPubky, attachmentId);
  }

  static async submitLocksPaykitProof(params: {
    creatorPubky: string;
    readerPubky: string;
    bundleId: string;
    lockResource: string;
    criterionId: string;
  }) {
    return await LocksGatewayService.submitPaykitProof(params);
  }

  static async lookupLocksVerification(creatorPubky: string, bundleId: string) {
    return await LocksGatewayService.lookupVerification(creatorPubky, bundleId);
  }

  static async issueLocksAccessCredential(creatorPubky: string, bundleId: string) {
    return await LocksGatewayService.issueAccessCredential(creatorPubky, bundleId);
  }

  static async fetchLocksGuardedContent(relativePath: string, credential: string) {
    return await LocksGatewayService.fetchGuardedContent(relativePath, credential);
  }

  static getPaykitSetupUrl(returnTo: string, state: string) {
    return LocksGatewayService.buildPaykitSetupUrl(returnTo, state);
  }

  static async isFavorite(ownerPubky: string, listingId: string): Promise<boolean> {
    return await LocalCommerceService.isFavorite(ownerPubky, listingId);
  }

  static async getCartItems(ownerPubky: string) {
    return await LocalCommerceService.getCartItems(ownerPubky);
  }

  static async commitUpsertCartItem(
    ownerPubky: string,
    listingId: string,
    variantId: string,
    quantity: number,
  ): Promise<void> {
    await LocalCommerceService.upsertCartItem(ownerPubky, listingId, variantId, quantity, Date.now());
  }

  static async commitDeleteCartItem(ownerPubky: string, listingId: string, variantId: string): Promise<void> {
    await LocalCommerceService.deleteCartItem(ownerPubky, listingId, variantId);
  }

  static async commitClearCart(ownerPubky: string): Promise<void> {
    await LocalCommerceService.clearCart(ownerPubky);
  }

  static async getFavorites(ownerPubky: string) {
    return await LocalCommerceService.getFavorites(ownerPubky);
  }

  static async commitCreateFavorite(ownerPubky: string, listingId: string): Promise<void> {
    await LocalCommerceService.createFavorite(ownerPubky, listingId, Date.now());
  }

  static async commitDeleteFavorite(ownerPubky: string, listingId: string): Promise<void> {
    await LocalCommerceService.deleteFavorite(ownerPubky, listingId);
  }

  static async isShopFollowed(ownerPubky: string, sellerPubky: string): Promise<boolean> {
    return await LocalCommerceService.isShopFollowed(ownerPubky, sellerPubky);
  }

  static async getShopFollows(ownerPubky: string) {
    return await LocalCommerceService.getShopFollows(ownerPubky);
  }

  static async commitCreateShopFollow(ownerPubky: string, sellerPubky: string): Promise<void> {
    await LocalCommerceService.createShopFollow(ownerPubky, sellerPubky, Date.now());
  }

  static async commitDeleteShopFollow(ownerPubky: string, sellerPubky: string): Promise<void> {
    await LocalCommerceService.deleteShopFollow(ownerPubky, sellerPubky);
  }

  static async fetchListing(ownerPubky: string, listingId: string): Promise<CommerceListingRecord> {
    const url = CommerceRecordNormalizer.listingUri(ownerPubky, listingId);
    return CommerceRecordNormalizer.listing(await CommerceHomeserverService.fetchJson(url));
  }

  static async getOrFetchListing(ownerPubky: string, listingId: string): Promise<CommerceListingRecord> {
    const compositeListingId = `${ownerPubky}:${listingId}`;
    const local = await LocalCommerceService.getListing(compositeListingId);
    if (local) return local.record;

    const record = await this.fetchListing(ownerPubky, listingId);
    await LocalCommerceService.upsertListing(record, 'synced');
    return record;
  }

  static async commitUpsertShop(record: CommerceShopRecord): Promise<void> {
    const now = Date.now();
    const url = CommerceRecordNormalizer.shopUri(record.ownerPubky);
    const job = this.createSyncJob({
      ownerId: record.ownerPubky,
      entityType: 'shop',
      entityId: record.ownerPubky,
      operation: 'publish',
      payload: { url },
      now,
    });

    await LocalCommerceService.stageShopSync(record, job);
    await CommerceHomeserverService.putJson(url, { ...record });
    await LocalCommerceService.upsertShop(record, 'synced');
    await LocalCommerceService.completeSyncJob(job.id);
  }

  static async commitUpsertListing(record: CommerceListingRecord): Promise<void> {
    const now = Date.now();
    const url = CommerceRecordNormalizer.listingUri(record.ownerPubky, record.listingId);
    const publishJob = this.createSyncJob({
      ownerId: record.ownerPubky,
      entityType: 'listing',
      entityId: record.listingId,
      operation: 'publish',
      payload: { url },
      now,
    });

    await LocalCommerceService.stageListingSync(record, publishJob);
    await CommerceHomeserverService.putJson(url, { ...record });
    await LocalCommerceService.upsertListing(record, 'synced');
    await LocalCommerceService.completeSyncJob(publishJob.id);

    await LocalCommerceService.enqueueSyncJob(
      this.createSyncJob({
        ownerId: record.ownerPubky,
        entityType: 'listing',
        entityId: record.listingId,
        operation: 'register',
        payload: {
          url,
          listingRevision: record.revision,
        },
        now: Date.now(),
      }),
    );
  }

  static async commitCreateMedia(ownerPubky: string, mediaId: string, bytes: Uint8Array): Promise<string> {
    const url = CommerceRecordNormalizer.mediaUri(ownerPubky, mediaId);
    await CommerceHomeserverService.putMedia(url, bytes);
    return url;
  }

  private static async registerSandboxListing(listing: CommerceListingRecord): Promise<void> {
    const aggregateId = buildMarketplaceListingAggregateId(listing.ownerPubky, listing.listingId);
    const existing = await MarketplaceGatewayService.getListing(aggregateId);
    if (existing?.serverRevision) return;
    const unitPrice = listing.sale.format === 'fixed_price' ? listing.sale.unitPrice : listing.sale.startingPrice;
    const command = CommerceRecordNormalizer.marketplaceCommand({
      version: 1,
      commandId: crypto.randomUUID(),
      aggregateId,
      expectedRevision: 0,
      issuedAt: new Date().toISOString(),
      kind: 'listing.register',
      payload: {
        sellerPubky: listing.ownerPubky,
        listingId: listing.listingId,
        title: listing.title,
        listingRevision: listing.revision,
        contentHash: listing.media[0].contentHash,
        quantity: listing.variants.reduce((total, variant) => total + variant.quantity, 0),
        unitPrice,
        saleFormat: listing.sale.format,
        auctionTerms:
          listing.sale.format === 'auction'
            ? {
                startsAt: listing.sale.startsAt,
                endsAt: listing.sale.endsAt,
                minimumIncrement: listing.sale.minimumIncrement,
                reservePrice: listing.sale.reservePrice,
                antiSnipingWindowSeconds: listing.sale.antiSnipingWindowSeconds,
                antiSnipingExtensionSeconds: listing.sale.antiSnipingExtensionSeconds,
              }
            : undefined,
      },
    });
    await MarketplaceGatewayService.execute(listing.ownerPubky, command);
  }

  private static createSyncJob({
    ownerId,
    entityType,
    entityId,
    operation,
    payload,
    now,
  }: {
    ownerId: string;
    entityType: CommerceSyncJobModelSchema['entity_type'];
    entityId: string;
    operation: CommerceSyncJobModelSchema['operation'];
    payload: CommerceSyncJobModelSchema['payload'];
    now: number;
  }): CommerceSyncJobModelSchema {
    return {
      id: crypto.randomUUID(),
      owner_id: ownerId,
      entity_type: entityType,
      entity_id: entityId,
      operation,
      status: 'pending',
      attempts: 0,
      next_attempt_at: now,
      last_error_code: null,
      payload,
      created_at: now,
      updated_at: now,
    };
  }
}
