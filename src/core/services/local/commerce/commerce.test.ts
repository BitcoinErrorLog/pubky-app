import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/database/franky/franky';
import {
  CommerceListingDraftModel,
  CommerceListingModel,
  CommerceListingProjectionModel,
  CommerceShopModel,
  CommerceSyncJobModel,
} from '@/models/commerce/commerce.models';
import {
  COMMERCE_FIXTURE_BUYER,
  COMMERCE_FIXTURE_SELLER,
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
      CommerceListingDraftModel.table.clear(),
      CommerceListingProjectionModel.table.clear(),
      CommerceSyncJobModel.table.clear(),
    ]);
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

  it('claims due jobs once and increments attempts atomically', async () => {
    await LocalCommerceService.enqueueSyncJob(createCommerceSyncJobFixture());

    const firstClaim = await LocalCommerceService.claimReadySyncJobs(COMMERCE_FIXTURE_SELLER, 2_000, 10);
    const secondClaim = await LocalCommerceService.claimReadySyncJobs(COMMERCE_FIXTURE_SELLER, 2_000, 10);

    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0]).toMatchObject({ status: 'running', attempts: 1, updated_at: 2_000 });
    expect(secondClaim).toEqual([]);
  });

  it('reschedules, terminally fails, resets, and completes jobs explicitly', async () => {
    const job = createCommerceSyncJobFixture();
    await LocalCommerceService.enqueueSyncJob(job);
    await LocalCommerceService.claimReadySyncJobs(COMMERCE_FIXTURE_SELLER, 2_000, 1);

    await LocalCommerceService.rescheduleSyncJob({
      id: job.id,
      errorCode: 'NETWORK_ERROR',
      nextAttemptAt: 5_000,
      now: 2_100,
    });
    expect(await LocalCommerceService.claimReadySyncJobs(COMMERCE_FIXTURE_SELLER, 4_999, 1)).toEqual([]);

    const retried = await LocalCommerceService.claimReadySyncJobs(COMMERCE_FIXTURE_SELLER, 5_000, 1);
    expect(retried[0]).toMatchObject({ attempts: 2, last_error_code: 'NETWORK_ERROR' });

    await LocalCommerceService.resetRunningSyncJobs(COMMERCE_FIXTURE_SELLER, 6_000);
    const reset = await CommerceSyncJobModel.findById(job.id);
    expect(reset).toMatchObject({ status: 'pending', next_attempt_at: 6_000 });

    await LocalCommerceService.failSyncJob(job.id, 'VALIDATION_ERROR', 7_000);
    expect(await CommerceSyncJobModel.findById(job.id)).toMatchObject({
      status: 'failed',
      last_error_code: 'VALIDATION_ERROR',
    });

    await LocalCommerceService.completeSyncJob(job.id);
    expect(await CommerceSyncJobModel.findById(job.id)).toBeNull();
  });

  it('rejects invalid sync claim limits', async () => {
    await expect(LocalCommerceService.claimReadySyncJobs(COMMERCE_FIXTURE_SELLER, 2_000, 0)).rejects.toMatchObject({
      name: 'AppError',
      code: 'INVALID_INPUT',
      category: 'validation',
    });
  });
});
