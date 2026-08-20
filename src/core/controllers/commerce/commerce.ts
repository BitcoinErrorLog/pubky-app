import { CommerceApplication } from '@/application/commerce/commerce';
import { IMAGE_MAX_UPLOAD_SIZE } from '@/config/images';
import { buildMarketplaceListingAggregateId } from '@/libs/commerce/transaction-commands';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { CommerceRecordNormalizer } from '@/pipes/commerce/commerce.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import type { CommerceConditionFilter, CommerceSaleFormatFilter } from '@/stores/commerce/commerce.types';

export class CommerceController {
  private constructor() {}

  static async getShop(ownerPubky: unknown) {
    return await CommerceApplication.getShop(CommerceRecordNormalizer.pubky(ownerPubky));
  }

  static async getAllShops() {
    return await CommerceApplication.getAllShops();
  }

  static async fetchShop(ownerPubky: unknown) {
    return await CommerceApplication.fetchShop(CommerceRecordNormalizer.pubky(ownerPubky));
  }

  static async getOrFetchShop(ownerPubky: unknown) {
    return await CommerceApplication.getOrFetchShop(CommerceRecordNormalizer.pubky(ownerPubky));
  }

  static async getListing(ownerPubky: unknown, listingId: unknown) {
    const owner = CommerceRecordNormalizer.pubky(ownerPubky);
    const id = CommerceRecordNormalizer.entityId(listingId);
    return await CommerceApplication.getListing(`${owner}:${id}`);
  }

  static async fetchListing(ownerPubky: unknown, listingId: unknown) {
    const owner = CommerceRecordNormalizer.pubky(ownerPubky);
    const id = CommerceRecordNormalizer.entityId(listingId);
    return await CommerceApplication.fetchListing(owner, id);
  }

  static async getOrFetchListing(ownerPubky: unknown, listingId: unknown) {
    const owner = CommerceRecordNormalizer.pubky(ownerPubky);
    const id = CommerceRecordNormalizer.entityId(listingId);
    return await CommerceApplication.getOrFetchListing(owner, id);
  }

  static async getListingsBySeller(sellerPubky: unknown) {
    return await CommerceApplication.getListingsBySeller(CommerceRecordNormalizer.pubky(sellerPubky));
  }

  static async getListingsByCategory(categoryId: unknown) {
    return await CommerceApplication.getListingsByCategory(CommerceRecordNormalizer.entityId(categoryId));
  }

  static async getAllListings() {
    return await CommerceApplication.getAllListings();
  }

  /**
   * Refreshes the catalog cache from the Nexus marketplace index.
   *
   * Maps the catalog filter state onto the filters Nexus can evaluate
   * server-side: sale format (when not 'all') and condition (only when
   * exactly one is selected — Nexus accepts a single condition). Everything
   * else (text query, hierarchical category prefix, minor-unit price range,
   * sorting) stays client-side in `filterMarketplaceCatalog`, so server-side
   * filters only narrow what gets fetched, never what renders.
   */
  static async fetchCatalogListings(filters: {
    saleFormat: CommerceSaleFormatFilter;
    conditions: CommerceConditionFilter[];
  }): Promise<void> {
    await CommerceApplication.fetchCatalogListings({
      ...(filters.saleFormat !== 'all' ? { saleFormat: filters.saleFormat } : {}),
      ...(filters.conditions.length === 1 ? { condition: filters.conditions[0] } : {}),
    });
  }

  static async initializeSandboxCatalog(): Promise<boolean> {
    return await CommerceApplication.initializeSandboxCatalog();
  }

  static async executeMarketplaceCommand(input: unknown) {
    return await CommerceApplication.executeMarketplaceCommand(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.marketplaceCommand(input),
    );
  }

  static async getMarketplaceListingProjection(ownerPubky: unknown, listingId: unknown) {
    const owner = CommerceRecordNormalizer.pubky(ownerPubky);
    const id = CommerceRecordNormalizer.entityId(listingId);
    // Nullable on purpose: the sandbox serves this projection to signed-out
    // visitors, while the durable transport requires the signed-in pubky to
    // bind its bearer session and degrades with session guidance otherwise.
    return await CommerceApplication.getMarketplaceListingProjection(
      useAuthStore.getState().currentUserPubky,
      buildMarketplaceListingAggregateId(owner, id),
    );
  }

  static async getMarketplaceConversations() {
    return await CommerceApplication.getMarketplaceConversations(this.getCurrentUserPubky());
  }

  static async getMarketplaceOffers() {
    return await CommerceApplication.getMarketplaceOffers(this.getCurrentUserPubky());
  }

  static async getMarketplaceNotifications() {
    return await CommerceApplication.getMarketplaceNotifications(this.getCurrentUserPubky());
  }

  static async getMarketplaceNotificationPreferences() {
    return await CommerceApplication.getMarketplaceNotificationPreferences(this.getCurrentUserPubky());
  }

  static async getMarketplaceOrders() {
    return await CommerceApplication.getMarketplaceOrders(this.getCurrentUserPubky());
  }

  static async getMarketplacePayment(paymentId: unknown) {
    return await CommerceApplication.getMarketplacePayment(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.entityId(paymentId),
    );
  }

  static async getMarketplaceReceipt(receiptId: unknown) {
    return await CommerceApplication.getMarketplaceReceipt(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.entityId(receiptId),
    );
  }

  static async getMarketplaceReports() {
    return await CommerceApplication.getMarketplaceReports(this.getCurrentUserPubky());
  }

  static async getMarketplaceOrder(orderId: unknown) {
    return await CommerceApplication.getMarketplaceOrder(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.entityId(orderId),
    );
  }

  static async getMarketplaceDisputes() {
    return await CommerceApplication.getMarketplaceDisputes(this.getCurrentUserPubky());
  }

  static async getMarketplaceOrderEvidence(orderId: unknown) {
    return await CommerceApplication.getMarketplaceOrderEvidence(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.entityId(orderId),
    );
  }

  static async uploadMarketplaceAttachment(recipientPubky: unknown, file: File) {
    const recipient = CommerceRecordNormalizer.pubky(recipientPubky);
    if (
      !(file instanceof File) ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size === 0 ||
      file.size > IMAGE_MAX_UPLOAD_SIZE
    ) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Message attachment is missing, unsafe, or too large.', {
        service: ErrorService.Local,
        operation: 'uploadMarketplaceAttachment',
        context: { mimeType: file?.type, byteSize: file?.size ?? 0 },
      });
    }
    return await CommerceApplication.uploadMarketplaceAttachment(this.getCurrentUserPubky(), recipient, file);
  }

  static async fetchMarketplaceAttachment(attachmentId: unknown) {
    return await CommerceApplication.fetchMarketplaceAttachment(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.entityId(attachmentId),
    );
  }

  static async submitLocksPaykitProof({
    creatorPubky,
    bundleId,
    lockResource,
    criterionId,
  }: {
    creatorPubky: unknown;
    bundleId: unknown;
    lockResource: unknown;
    criterionId: unknown;
  }) {
    return await CommerceApplication.submitLocksPaykitProof({
      creatorPubky: CommerceRecordNormalizer.pubky(creatorPubky),
      readerPubky: this.getCurrentUserPubky(),
      bundleId: CommerceRecordNormalizer.entityId(bundleId),
      lockResource: CommerceRecordNormalizer.lockResource(lockResource),
      criterionId: CommerceRecordNormalizer.entityId(criterionId),
    });
  }

  static async lookupLocksVerification(creatorPubky: unknown, bundleId: unknown) {
    return await CommerceApplication.lookupLocksVerification(
      CommerceRecordNormalizer.pubky(creatorPubky),
      CommerceRecordNormalizer.entityId(bundleId),
    );
  }

  static async issueLocksAccessCredential(creatorPubky: unknown, bundleId: unknown) {
    return await CommerceApplication.issueLocksAccessCredential(
      CommerceRecordNormalizer.pubky(creatorPubky),
      CommerceRecordNormalizer.entityId(bundleId),
    );
  }

  static async fetchLocksGuardedContent(relativePath: unknown, credential: unknown) {
    if (
      typeof relativePath !== 'string' ||
      relativePath
        .split('/')
        .filter(Boolean)
        .some((segment) => !/^[A-Za-z0-9_.-]+$/.test(segment)) ||
      typeof credential !== 'string' ||
      credential.length === 0 ||
      credential.length > 4_096
    ) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Locks content request is invalid.', {
        service: ErrorService.Local,
        operation: 'fetchLocksGuardedContent',
      });
    }
    return await CommerceApplication.fetchLocksGuardedContent(relativePath, credential);
  }

  static getPaykitSetupUrl(returnTo: unknown, state: unknown): string {
    const parsedReturnTo = typeof returnTo === 'string' ? URL.parse(returnTo) : null;
    if (!parsedReturnTo || !['http:', 'https:'].includes(parsedReturnTo.protocol)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Paykit setup return URL is invalid.', {
        service: ErrorService.Local,
        operation: 'getPaykitSetupUrl',
      });
    }
    return CommerceApplication.getPaykitSetupUrl(parsedReturnTo.toString(), CommerceRecordNormalizer.entityId(state));
  }

  static async getListingDrafts() {
    return await CommerceApplication.getListingDrafts(this.getCurrentUserPubky());
  }

  static async commitUpdateListingDraft(listingId: unknown, form: unknown): Promise<void> {
    await CommerceApplication.commitUpdateListingDraft(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.entityId(listingId),
      CommerceRecordNormalizer.jsonValue(form),
    );
  }

  static async commitDeleteListingDraft(listingId: unknown): Promise<void> {
    await CommerceApplication.commitDeleteListingDraft(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.entityId(listingId),
    );
  }

  static async isFavorite(listingCompositeId: unknown): Promise<boolean> {
    return await CommerceApplication.isFavorite(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.listingCompositeId(listingCompositeId),
    );
  }

  static async getCartItems() {
    return await CommerceApplication.getCartItems(this.getCurrentUserPubky());
  }

  static async commitUpsertCartItem(listingCompositeId: unknown, variantId: unknown, quantity: unknown): Promise<void> {
    const parsedQuantity =
      typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity > 0 ? quantity : Number.NaN;
    await CommerceApplication.commitUpsertCartItem(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.listingCompositeId(listingCompositeId),
      CommerceRecordNormalizer.entityId(variantId),
      parsedQuantity,
    );
  }

  static async commitDeleteCartItem(listingCompositeId: unknown, variantId: unknown): Promise<void> {
    await CommerceApplication.commitDeleteCartItem(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.listingCompositeId(listingCompositeId),
      CommerceRecordNormalizer.entityId(variantId),
    );
  }

  static async commitClearCart(): Promise<void> {
    await CommerceApplication.commitClearCart(this.getCurrentUserPubky());
  }

  static async getFavorites() {
    return await CommerceApplication.getFavorites(this.getCurrentUserPubky());
  }

  static async commitCreateFavorite(listingCompositeId: unknown): Promise<void> {
    await CommerceApplication.commitCreateFavorite(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.listingCompositeId(listingCompositeId),
    );
  }

  static async commitDeleteFavorite(listingCompositeId: unknown): Promise<void> {
    await CommerceApplication.commitDeleteFavorite(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.listingCompositeId(listingCompositeId),
    );
  }

  static async isShopFollowed(sellerPubky: unknown): Promise<boolean> {
    return await CommerceApplication.isShopFollowed(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.pubky(sellerPubky),
    );
  }

  static async getShopFollows() {
    return await CommerceApplication.getShopFollows(this.getCurrentUserPubky());
  }

  static async commitCreateShopFollow(sellerPubky: unknown): Promise<void> {
    const ownerPubky = this.getCurrentUserPubky();
    const seller = CommerceRecordNormalizer.pubky(sellerPubky);
    if (ownerPubky === seller) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'A seller cannot follow their own shop.', {
        service: ErrorService.Local,
        operation: 'commitCreateShopFollow',
      });
    }
    await CommerceApplication.commitCreateShopFollow(ownerPubky, seller);
  }

  static async commitDeleteShopFollow(sellerPubky: unknown): Promise<void> {
    await CommerceApplication.commitDeleteShopFollow(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.pubky(sellerPubky),
    );
  }

  static async commitUpsertShop(input: unknown): Promise<void> {
    const record = CommerceRecordNormalizer.shop(input);
    this.assertCurrentUserOwns(record.ownerPubky);
    await this.withPending(`shop:${record.ownerPubky}`, () => CommerceApplication.commitUpsertShop(record));
  }

  static async commitUpsertListing(input: unknown): Promise<void> {
    const record = CommerceRecordNormalizer.listing(input);
    this.assertCurrentUserOwns(record.ownerPubky);
    await this.withPending(`${record.ownerPubky}:${record.listingId}`, () =>
      CommerceApplication.commitUpsertListing(record),
    );
  }

  static async commitCreateMedia(mediaId: unknown, bytes: Uint8Array): Promise<string> {
    const id = CommerceRecordNormalizer.entityId(mediaId);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > IMAGE_MAX_UPLOAD_SIZE) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Marketplace media bytes are missing or too large.', {
        service: ErrorService.Local,
        operation: 'commitCreateMedia',
        context: { byteLength: bytes?.byteLength ?? 0 },
      });
    }
    return await CommerceApplication.commitCreateMedia(this.getCurrentUserPubky(), id, bytes);
  }

  private static assertCurrentUserOwns(ownerPubky: string): void {
    const currentUserPubky = this.getCurrentUserPubky();
    if (currentUserPubky !== ownerPubky) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Commerce record owner must match the signed-in user.', {
        service: ErrorService.Local,
        operation: 'assertCurrentUserOwns',
        context: { ownerMatches: false },
      });
    }
  }

  private static getCurrentUserPubky(): string {
    return useAuthStore.getState().selectCurrentUserPubky();
  }

  private static async withPending(entityId: string, operation: () => Promise<void>): Promise<void> {
    const store = useCommerceStore.getState();
    store.setEntityPending(entityId, true);
    try {
      await operation();
    } finally {
      useCommerceStore.getState().setEntityPending(entityId, false);
    }
  }
}
