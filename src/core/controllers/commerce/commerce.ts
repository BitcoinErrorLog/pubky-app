import { CommerceApplication } from '@/application/commerce/commerce';
import { IMAGE_MAX_UPLOAD_SIZE } from '@/config/images';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { CommerceRecordNormalizer } from '@/pipes/commerce/commerce.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCommerceStore } from '@/stores/commerce/commerce.store';

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

  static async initializeSandboxCatalog(): Promise<boolean> {
    return await CommerceApplication.initializeSandboxCatalog();
  }

  static async isFavorite(listingCompositeId: unknown): Promise<boolean> {
    return await CommerceApplication.isFavorite(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.listingCompositeId(listingCompositeId),
    );
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
