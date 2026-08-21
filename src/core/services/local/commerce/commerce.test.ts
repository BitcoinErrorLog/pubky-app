import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/database/franky/franky';
import { createCommerceSandboxCatalog } from '@/libs/commerce/sandbox-catalog';
import {
  CommerceCartItemModel,
  CommerceCatalogEntryModel,
  CommerceFavoriteModel,
  CommerceListingDraftModel,
  CommerceListingModel,
  CommerceListingProjectionModel,
  CommerceShopFollowModel,
  CommerceShopModel,
  CommerceSyncJobModel,
} from '@/models/commerce/commerce.models';
import {
  COMMERCE_FIXTURE_BUYER,
  COMMERCE_FIXTURE_SELLER,
  createCommerceCatalogEntryFixture,
  createCommerceListingFixture,
  createCommerceProjectionFixture,
  createCommerceShopFixture,
  createCommerceSyncJobFixture,
} from '@/test/fixtures/commerce/commerce';
import { LocalCommerceService } from './commerce';

describe('LocalCommerceService', () => {
  beforeEach(async () => {
    await db.initialize();
    await Promise.all([
      CommerceShopModel.table.clear(),
      CommerceListingModel.table.clear(),
      CommerceCatalogEntryModel.table.clear(),
      CommerceListingDraftModel.table.clear(),
      CommerceListingProjectionModel.table.clear(),
      CommerceSyncJobModel.table.clear(),
      CommerceFavoriteModel.table.clear(),
      CommerceShopFollowModel.table.clear(),
      CommerceCartItemModel.table.clear(),
    ]);
  });

  it('seeds the deterministic sandbox catalog once', async () => {
    const catalog = createCommerceSandboxCatalog();

    await expect(LocalCommerceService.seedSandboxCatalog(catalog)).resolves.toBe(true);
    await expect(LocalCommerceService.seedSandboxCatalog(catalog)).resolves.toBe(false);

    expect(await LocalCommerceService.getAllShops()).toHaveLength(8);
    expect(await LocalCommerceService.getAllListings()).toHaveLength(8);
    expect(await CommerceListingProjectionModel.table.count()).toBe(8);
  });

  it('persists normalized shop and listing cache fields', async () => {
    const shop = createCommerceShopFixture();
    const listing = createCommerceListingFixture();

    await LocalCommerceService.upsertShop(shop, 'pending');
    await LocalCommerceService.upsertListing(listing, 'synced');

    const storedShop = await LocalCommerceService.getShop(COMMERCE_FIXTURE_SELLER);
    const storedListing = await LocalCommerceService.getListing(`${COMMERCE_FIXTURE_SELLER}:boots_01`);

    expect(storedShop).toMatchObject({
      owner_id: COMMERCE_FIXTURE_SELLER,
      revision: 1,
      sync_status: 'pending',
    });
    expect(storedListing).toMatchObject({
      seller_id: COMMERCE_FIXTURE_SELLER,
      category_id: 'fashion-shoes-boots',
      format: 'fixed_price',
      currency: 'USD',
      price_minor: 12_500,
      sync_status: 'synced',
    });
  });

  it('deletes a listing from the record, projection, and catalog caches at once', async () => {
    const listing = createCommerceListingFixture();
    const compositeId = `${COMMERCE_FIXTURE_SELLER}:boots_01`;
    await LocalCommerceService.upsertListing(listing, 'synced');
    await CommerceListingProjectionModel.upsert(createCommerceProjectionFixture());
    await LocalCommerceService.bulkUpsertCatalogEntries([createCommerceCatalogEntryFixture()]);

    await LocalCommerceService.deleteListing(compositeId);

    expect(await LocalCommerceService.getListing(compositeId)).toBeNull();
    expect(await LocalCommerceService.getListingProjection(compositeId)).toBeNull();
    expect(await LocalCommerceService.getCatalogEntry(compositeId)).toBeNull();
  });

  it('bulk-upserts discovered catalog entries and reads them back newest first, by seller, and by id', async () => {
    const older = createCommerceCatalogEntryFixture({
      updated_at: Date.parse('2026-08-19T20:00:00.000Z'),
    });
    const newerOtherSeller = createCommerceCatalogEntryFixture({
      id: `${COMMERCE_FIXTURE_BUYER}:jacket_01`,
      seller_id: COMMERCE_FIXTURE_BUYER,
      listing_id: 'jacket_01',
      title: 'Selvedge denim jacket',
      updated_at: Date.parse('2026-08-19T22:00:00.000Z'),
    });

    await LocalCommerceService.bulkUpsertCatalogEntries([older, newerOtherSeller]);
    // A rediscovery of the same listing replaces the row instead of duplicating it.
    const reindexed = { ...older, revision: 2, title: 'Vintage leather boots (reindexed)' };
    await LocalCommerceService.bulkUpsertCatalogEntries([reindexed]);

    const all = await LocalCommerceService.getAllCatalogEntries();
    expect(all.map(({ id }) => id)).toEqual([newerOtherSeller.id, older.id]);

    const bySeller = await LocalCommerceService.getCatalogEntriesBySeller(COMMERCE_FIXTURE_SELLER);
    expect(bySeller).toEqual([reindexed]);

    const byId = await LocalCommerceService.getCatalogEntry(older.id);
    expect(byId).toMatchObject({ revision: 2, title: 'Vintage leather boots (reindexed)' });
  });

  it('stages public records and their retry jobs in the same local transaction', async () => {
    const shop = createCommerceShopFixture();
    const listing = createCommerceListingFixture();
    const shopJob = createCommerceSyncJobFixture({
      id: '018f47d2-6a27-7c23-a49d-6b21bb770125',
      entity_type: 'shop',
      entity_id: COMMERCE_FIXTURE_SELLER,
      operation: 'publish',
    });
    const listingJob = createCommerceSyncJobFixture();

    await LocalCommerceService.stageShopSync(shop, shopJob);
    await LocalCommerceService.stageListingSync(listing, listingJob);

    expect(await LocalCommerceService.getShop(COMMERCE_FIXTURE_SELLER)).toMatchObject({ sync_status: 'pending' });
    expect(await LocalCommerceService.getListing(`${COMMERCE_FIXTURE_SELLER}:boots_01`)).toMatchObject({
      sync_status: 'pending',
    });
    expect(await CommerceSyncJobModel.findById(shopJob.id)).toMatchObject({ entity_type: 'shop' });
    expect(await CommerceSyncJobModel.findById(listingJob.id)).toMatchObject({ entity_type: 'listing' });
  });

  it('rejects a sync job scoped to a different public record', async () => {
    const listing = createCommerceListingFixture();
    const mismatchedJob = createCommerceSyncJobFixture({ entity_id: 'other_listing' });

    await expect(LocalCommerceService.stageListingSync(listing, mismatchedJob)).rejects.toMatchObject({
      name: 'AppError',
      code: 'INVALID_INPUT',
      category: 'validation',
    });
    expect(await CommerceListingModel.table.count()).toBe(0);
    expect(await CommerceSyncJobModel.table.count()).toBe(0);
  });

  it('atomically persists matching public terms and transaction projection', async () => {
    const listing = createCommerceListingFixture();
    const projection = createCommerceProjectionFixture();

    await LocalCommerceService.upsertListingAndProjection(listing, 'synced', projection);

    const storedListing = await LocalCommerceService.getListing(projection.id);
    const storedProjection = await LocalCommerceService.getListingProjection(projection.id);

    expect(storedListing?.revision).toBe(1);
    expect(storedProjection).toMatchObject({
      listing_revision: 1,
      server_revision: 3,
      state: 'available',
    });
  });

  it('rejects mismatched projections before writing either record', async () => {
    const listing = createCommerceListingFixture();
    const projection = createCommerceProjectionFixture({ listing_revision: 2 });

    await expect(LocalCommerceService.upsertListingAndProjection(listing, 'synced', projection)).rejects.toMatchObject({
      name: 'AppError',
      code: 'INVALID_INPUT',
      category: 'validation',
    });

    expect(await CommerceListingModel.table.count()).toBe(0);
    expect(await CommerceListingProjectionModel.table.count()).toBe(0);
  });

  it('keeps listing drafts account-scoped and preserves their creation timestamp', async () => {
    await LocalCommerceService.upsertDraft({
      ownerId: COMMERCE_FIXTURE_SELLER,
      listingId: 'boots_01',
      data: { ownerPubky: COMMERCE_FIXTURE_SELLER, listingId: 'boots_01', title: 'First title' },
      now: 100,
    });
    await LocalCommerceService.upsertDraft({
      ownerId: COMMERCE_FIXTURE_SELLER,
      listingId: 'boots_01',
      data: { ownerPubky: COMMERCE_FIXTURE_SELLER, listingId: 'boots_01', title: 'Updated title' },
      now: 200,
    });
    await LocalCommerceService.upsertDraft({
      ownerId: COMMERCE_FIXTURE_BUYER,
      listingId: 'private',
      data: { ownerPubky: COMMERCE_FIXTURE_BUYER, listingId: 'private', title: 'Other account' },
      now: 300,
    });

    const sellerDrafts = await LocalCommerceService.getDraftsByOwner(COMMERCE_FIXTURE_SELLER);

    expect(sellerDrafts).toHaveLength(1);
    expect(sellerDrafts[0]).toMatchObject({
      created_at: 100,
      updated_at: 200,
      data: { title: 'Updated title' },
    });
  });

  it('rejects a draft whose embedded identity does not match its storage scope', async () => {
    await expect(
      LocalCommerceService.upsertDraft({
        ownerId: COMMERCE_FIXTURE_SELLER,
        listingId: 'boots_01',
        data: { ownerPubky: COMMERCE_FIXTURE_BUYER, listingId: 'other', title: 'Cross-account draft' },
        now: 100,
      }),
    ).rejects.toMatchObject({
      name: 'AppError',
      code: 'INVALID_INPUT',
      category: 'validation',
    });

    expect(await CommerceListingDraftModel.table.count()).toBe(0);
  });

  it('completes a staged sync job by removing it', async () => {
    const job = createCommerceSyncJobFixture();
    await LocalCommerceService.stageListingSync(createCommerceListingFixture(), job);
    expect(await CommerceSyncJobModel.findById(job.id)).toMatchObject({ status: 'pending' });

    await LocalCommerceService.completeSyncJob(job.id);
    expect(await CommerceSyncJobModel.findById(job.id)).toBeNull();
  });

  it('persists idempotent favorites and shop follows per owner', async () => {
    const listingId = `${COMMERCE_FIXTURE_BUYER}:boots_01`;

    await LocalCommerceService.createFavorite(COMMERCE_FIXTURE_SELLER, listingId, 100);
    await LocalCommerceService.createFavorite(COMMERCE_FIXTURE_SELLER, listingId, 200);
    await LocalCommerceService.createShopFollow(COMMERCE_FIXTURE_SELLER, COMMERCE_FIXTURE_BUYER, 300);

    expect(await LocalCommerceService.isFavorite(COMMERCE_FIXTURE_SELLER, listingId)).toBe(true);
    expect(await LocalCommerceService.getFavorites(COMMERCE_FIXTURE_SELLER)).toHaveLength(1);
    expect(await LocalCommerceService.isShopFollowed(COMMERCE_FIXTURE_SELLER, COMMERCE_FIXTURE_BUYER)).toBe(true);

    await LocalCommerceService.deleteFavorite(COMMERCE_FIXTURE_SELLER, listingId);
    await LocalCommerceService.deleteShopFollow(COMMERCE_FIXTURE_SELLER, COMMERCE_FIXTURE_BUYER);

    expect(await LocalCommerceService.isFavorite(COMMERCE_FIXTURE_SELLER, listingId)).toBe(false);
    expect(await LocalCommerceService.isShopFollowed(COMMERCE_FIXTURE_SELLER, COMMERCE_FIXTURE_BUYER)).toBe(false);
  });

  it('persists account-scoped cart quantities against real listing variants', async () => {
    const listing = createCommerceListingFixture();
    listing.variants[0].quantity = 3;
    await LocalCommerceService.upsertListing(listing, 'synced');
    const listingId = `${COMMERCE_FIXTURE_SELLER}:${listing.listingId}`;

    await LocalCommerceService.upsertCartItem(COMMERCE_FIXTURE_BUYER, listingId, 'variant_01', 2, 100);
    await LocalCommerceService.upsertCartItem(COMMERCE_FIXTURE_BUYER, listingId, 'variant_01', 3, 200);

    expect(await LocalCommerceService.getCartItems(COMMERCE_FIXTURE_BUYER)).toEqual([
      expect.objectContaining({ listing_id: listingId, variant_id: 'variant_01', quantity: 3, added_at: 100 }),
    ]);
    await expect(
      LocalCommerceService.upsertCartItem(COMMERCE_FIXTURE_BUYER, listingId, 'variant_01', 4, 300),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    await LocalCommerceService.clearCart(COMMERCE_FIXTURE_BUYER);
    expect(await LocalCommerceService.getCartItems(COMMERCE_FIXTURE_BUYER)).toEqual([]);
  });
});
