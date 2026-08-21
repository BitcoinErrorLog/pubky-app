import { afterEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import * as commerceConfig from '@/config/commerce';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { CommerceCatalogEntryModel, CommerceListingModel, CommerceShopModel } from '@/models/commerce/commerce.models';
import { CommerceHomeserverService } from '@/services/homeserver/commerce/commerce';
import { LocalCommerceService } from '@/services/local/commerce/commerce';
import { LocalMarketplaceTagService } from '@/services/local/tag/marketplace/tag.marketplace';
import { MarketplaceGatewayService } from '@/services/marketplace/marketplace';
import { NexusMarketplaceService } from '@/services/nexus/marketplace/marketplace';
import {
  COMMERCE_FIXTURE_SELLER,
  createCommerceCatalogEntryFixture,
  createCommerceListingFixture,
  createCommerceShopFixture,
  createNexusAuctionListingDetailsFixture,
  createNexusListingDetailsFixture,
} from '@/test/fixtures/commerce/commerce';
import { CommerceApplication } from './commerce';

const SHOP_URL = `pubky://${COMMERCE_FIXTURE_SELLER}/pub/pubky.app/marketplace/v1/shop.json`;
const LISTING_URL = `pubky://${COMMERCE_FIXTURE_SELLER}/pub/pubky.app/marketplace/v1/listings/boots_01`;

describe('CommerceApplication', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a local shop without a network request', async () => {
    const record = createCommerceShopFixture();
    vi.spyOn(LocalCommerceService, 'getShop').mockResolvedValue(
      new CommerceShopModel({
        id: COMMERCE_FIXTURE_SELLER,
        owner_id: COMMERCE_FIXTURE_SELLER,
        record,
        revision: 1,
        sync_status: 'synced',
        updated_at: Date.parse(record.updatedAt),
      }),
    );
    const fetchJson = vi.spyOn(CommerceHomeserverService, 'fetchJson');

    await expect(CommerceApplication.getOrFetchShop(COMMERCE_FIXTURE_SELLER)).resolves.toEqual(record);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('seeds catalog data only when sandbox mode is explicit', async () => {
    const seed = vi.spyOn(LocalCommerceService, 'seedSandboxCatalog').mockResolvedValue(true);
    vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('unavailable');

    await expect(CommerceApplication.initializeSandboxCatalog()).resolves.toBe(false);
    expect(seed).not.toHaveBeenCalled();

    vi.mocked(commerceConfig.getCommerceAdapterMode).mockReturnValue('sandbox');
    await expect(CommerceApplication.initializeSandboxCatalog()).resolves.toBe(true);
    expect(seed).toHaveBeenCalledOnce();
  });

  it('fetches, validates, and caches a missing shop', async () => {
    const record = createCommerceShopFixture();
    vi.spyOn(LocalCommerceService, 'getShop').mockResolvedValue(null);
    vi.spyOn(CommerceHomeserverService, 'fetchJson').mockResolvedValue(record);
    const upsert = vi.spyOn(LocalCommerceService, 'upsertShop').mockResolvedValue(undefined);

    await expect(CommerceApplication.getOrFetchShop(COMMERCE_FIXTURE_SELLER)).resolves.toEqual(record);
    expect(upsert).toHaveBeenCalledWith(record, 'synced');
  });

  it('fetches, validates, and caches a missing listing', async () => {
    const record = createCommerceListingFixture();
    vi.spyOn(LocalCommerceService, 'getListing').mockResolvedValue(null);
    vi.spyOn(CommerceHomeserverService, 'fetchJson').mockResolvedValue(record);
    const upsert = vi.spyOn(LocalCommerceService, 'upsertListing').mockResolvedValue(undefined);

    await expect(CommerceApplication.getOrFetchListing(COMMERCE_FIXTURE_SELLER, 'boots_01')).resolves.toEqual(record);
    expect(CommerceHomeserverService.fetchJson).toHaveBeenCalledWith(LISTING_URL);
    expect(upsert).toHaveBeenCalledWith(record, 'synced');
  });

  it('stages a shop locally before publishing and then clears its job', async () => {
    const record = createCommerceShopFixture();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('018f47d2-6a27-7c23-a49d-6b21bb770120');
    const stage = vi.spyOn(LocalCommerceService, 'stageShopSync').mockResolvedValue(undefined);
    const put = vi.spyOn(CommerceHomeserverService, 'putJson').mockResolvedValue(undefined);
    const upsert = vi.spyOn(LocalCommerceService, 'upsertShop').mockResolvedValue(undefined);
    const complete = vi.spyOn(LocalCommerceService, 'completeSyncJob').mockResolvedValue(undefined);

    await CommerceApplication.commitUpsertShop(record);

    expect(stage).toHaveBeenCalledWith(
      record,
      expect.objectContaining({
        id: '018f47d2-6a27-7c23-a49d-6b21bb770120',
        entity_type: 'shop',
        entity_id: COMMERCE_FIXTURE_SELLER,
        operation: 'publish',
        status: 'pending',
        payload: { url: SHOP_URL },
      }),
    );
    expect(stage.mock.invocationCallOrder[0]).toBeLessThan(put.mock.invocationCallOrder[0]);
    expect(put).toHaveBeenCalledWith(SHOP_URL, record);
    expect(upsert).toHaveBeenCalledWith(record, 'synced');
    expect(complete).toHaveBeenCalledWith('018f47d2-6a27-7c23-a49d-6b21bb770120');
  });

  it('leaves a staged shop pending when the homeserver write fails', async () => {
    const record = createCommerceShopFixture();
    vi.spyOn(LocalCommerceService, 'stageShopSync').mockResolvedValue(undefined);
    vi.spyOn(CommerceHomeserverService, 'putJson').mockRejectedValue(new TypeError('network unavailable'));
    const upsert = vi.spyOn(LocalCommerceService, 'upsertShop');
    const complete = vi.spyOn(LocalCommerceService, 'completeSyncJob');

    await expect(CommerceApplication.commitUpsertShop(record)).rejects.toThrow('network unavailable');
    expect(upsert).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('publishes a listing and registers it with the transaction service in sandbox mode', async () => {
    const record = createCommerceListingFixture();
    vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('sandbox');
    const stage = vi.spyOn(LocalCommerceService, 'stageListingSync').mockResolvedValue(undefined);
    vi.spyOn(CommerceHomeserverService, 'putJson').mockResolvedValue(undefined);
    vi.spyOn(LocalCommerceService, 'upsertListing').mockResolvedValue(undefined);
    vi.spyOn(LocalCommerceService, 'completeSyncJob').mockResolvedValue(undefined);
    vi.spyOn(MarketplaceGatewayService, 'getListing').mockResolvedValue(null);
    const execute = vi.spyOn(MarketplaceGatewayService, 'execute').mockResolvedValue({} as never);

    await CommerceApplication.commitUpsertListing(record);

    expect(stage).toHaveBeenCalledWith(record, expect.objectContaining({ operation: 'publish' }));
    expect(execute).toHaveBeenCalledWith(
      record.ownerPubky,
      expect.objectContaining({
        kind: 'listing.register',
        payload: expect.objectContaining({
          sellerPubky: record.ownerPubky,
          listingId: record.listingId,
          listingRevision: record.revision,
        }),
      }),
    );
  });

  it('skips transaction-service registration when the listing is already registered', async () => {
    const record = createCommerceListingFixture();
    vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('sandbox');
    vi.spyOn(LocalCommerceService, 'stageListingSync').mockResolvedValue(undefined);
    vi.spyOn(CommerceHomeserverService, 'putJson').mockResolvedValue(undefined);
    vi.spyOn(LocalCommerceService, 'upsertListing').mockResolvedValue(undefined);
    vi.spyOn(LocalCommerceService, 'completeSyncJob').mockResolvedValue(undefined);
    vi.spyOn(MarketplaceGatewayService, 'getListing').mockResolvedValue({ serverRevision: 4 } as never);
    const execute = vi.spyOn(MarketplaceGatewayService, 'execute');

    await CommerceApplication.commitUpsertListing(record);

    expect(execute).not.toHaveBeenCalled();
  });

  it('publishes a listing without registration when the marketplace adapter is unavailable', async () => {
    const record = createCommerceListingFixture();
    vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('unavailable');
    vi.spyOn(LocalCommerceService, 'stageListingSync').mockResolvedValue(undefined);
    const put = vi.spyOn(CommerceHomeserverService, 'putJson').mockResolvedValue(undefined);
    vi.spyOn(LocalCommerceService, 'upsertListing').mockResolvedValue(undefined);
    vi.spyOn(LocalCommerceService, 'completeSyncJob').mockResolvedValue(undefined);
    const execute = vi.spyOn(MarketplaceGatewayService, 'execute');

    await CommerceApplication.commitUpsertListing(record);

    expect(put).toHaveBeenCalledWith(LISTING_URL, record);
    expect(execute).not.toHaveBeenCalled();
  });

  it('deletes a listing from the homeserver, then every local cache, then its media', async () => {
    const record = createCommerceListingFixture();
    const compositeId = `${record.ownerPubky}:${record.listingId}`;
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('018f47d2-6a27-7c23-a49d-6b21bb770122');
    vi.spyOn(LocalCommerceService, 'getListing').mockResolvedValue(
      new CommerceListingModel({
        id: compositeId,
        seller_id: record.ownerPubky,
        listing_id: record.listingId,
        record,
        revision: record.revision,
        state: record.state,
        category_id: record.categoryId,
        format: record.sale.format,
        currency: 'USD',
        price_minor: 12_500,
        sync_status: 'synced',
        updated_at: Date.parse(record.updatedAt),
      }),
    );
    const upsertJob = vi.spyOn(LocalCommerceService, 'upsertSyncJob').mockResolvedValue(undefined);
    const remove = vi.spyOn(CommerceHomeserverService, 'delete').mockResolvedValue(undefined);
    const deleteLocal = vi.spyOn(LocalCommerceService, 'deleteListing').mockResolvedValue(undefined);
    const complete = vi.spyOn(LocalCommerceService, 'completeSyncJob').mockResolvedValue(undefined);

    await CommerceApplication.commitDeleteListing(record.ownerPubky, record.listingId);

    expect(upsertJob).toHaveBeenCalledWith(
      expect.objectContaining({ entity_type: 'listing', entity_id: record.listingId, operation: 'remove' }),
    );
    expect(remove).toHaveBeenNthCalledWith(1, LISTING_URL);
    expect(deleteLocal).toHaveBeenCalledWith(compositeId);
    expect(complete).toHaveBeenCalledWith('018f47d2-6a27-7c23-a49d-6b21bb770122');
    // Media cleanup follows the record deletion, one call per media file.
    record.media.forEach((media) => expect(remove).toHaveBeenCalledWith(media.url));
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(deleteLocal.mock.invocationCallOrder[0]);
  });

  it('keeps the local listing when the homeserver record deletion fails', async () => {
    const record = createCommerceListingFixture();
    vi.spyOn(LocalCommerceService, 'getListing').mockResolvedValue(null);
    vi.spyOn(LocalCommerceService, 'upsertSyncJob').mockResolvedValue(undefined);
    vi.spyOn(CommerceHomeserverService, 'delete').mockRejectedValue(new TypeError('network unavailable'));
    const deleteLocal = vi.spyOn(LocalCommerceService, 'deleteListing');
    const complete = vi.spyOn(LocalCommerceService, 'completeSyncJob');

    await expect(CommerceApplication.commitDeleteListing(record.ownerPubky, record.listingId)).rejects.toThrow(
      'network unavailable',
    );
    expect(deleteLocal).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  describe('fetchSellerCatalogListings', () => {
    it('hydrates one seller from the Nexus index outside sandbox mode', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('transaction-service');
      const stream = vi
        .spyOn(NexusMarketplaceService, 'fetchListingStream')
        .mockResolvedValue([createNexusListingDetailsFixture()]);
      const bulkUpsert = vi.spyOn(LocalCommerceService, 'bulkUpsertCatalogEntries').mockResolvedValue(undefined);

      await CommerceApplication.fetchSellerCatalogListings(COMMERCE_FIXTURE_SELLER);

      expect(stream).toHaveBeenCalledWith(
        expect.objectContaining({ seller_id: COMMERCE_FIXTURE_SELLER, state: 'active' }),
      );
      expect(bulkUpsert).toHaveBeenCalledOnce();
    });

    it('never reads from Nexus in sandbox mode', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('sandbox');
      const stream = vi.spyOn(NexusMarketplaceService, 'fetchListingStream');

      await CommerceApplication.fetchSellerCatalogListings(COMMERCE_FIXTURE_SELLER);

      expect(stream).not.toHaveBeenCalled();
    });
  });

  describe('fetchMarketplaceTags', () => {
    const VIEWER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
    const nexusTag = { label: 'handmade', taggers: [VIEWER], taggers_count: 1, relationship: true };

    it('fetches listing tags from Nexus and merges them into the local cache', async () => {
      const fetchSpy = vi.spyOn(NexusMarketplaceService, 'fetchListingTags').mockResolvedValue([nexusTag]);
      const mergeSpy = vi.spyOn(LocalMarketplaceTagService, 'mergeTags').mockResolvedValue(undefined);

      const result = await CommerceApplication.fetchMarketplaceTags({
        kind: TagKind.LISTING,
        taggedId: `${COMMERCE_FIXTURE_SELLER}:0034A0X7NJ52A`,
        viewerId: VIEWER,
      });

      expect(result).toEqual([nexusTag]);
      expect(fetchSpy).toHaveBeenCalledWith({
        seller_id: COMMERCE_FIXTURE_SELLER,
        listing_id: '0034A0X7NJ52A',
        skip_tags: undefined,
        limit_tags: undefined,
        viewer_id: VIEWER,
      });
      expect(mergeSpy).toHaveBeenCalledWith({
        taggedId: `listing:${COMMERCE_FIXTURE_SELLER}:0034A0X7NJ52A`,
        tags: [nexusTag],
        viewerId: VIEWER,
      });
    });

    it('fetches shop tags from Nexus keyed by the owner pubky', async () => {
      const fetchSpy = vi.spyOn(NexusMarketplaceService, 'fetchShopTags').mockResolvedValue([nexusTag]);
      const mergeSpy = vi.spyOn(LocalMarketplaceTagService, 'mergeTags').mockResolvedValue(undefined);

      await CommerceApplication.fetchMarketplaceTags({ kind: TagKind.SHOP, taggedId: COMMERCE_FIXTURE_SELLER });

      expect(fetchSpy).toHaveBeenCalledWith({
        seller_id: COMMERCE_FIXTURE_SELLER,
        skip_tags: undefined,
        limit_tags: undefined,
        viewer_id: undefined,
      });
      expect(mergeSpy).toHaveBeenCalledWith({
        taggedId: `shop:${COMMERCE_FIXTURE_SELLER}`,
        tags: [nexusTag],
        viewerId: null,
      });
    });

    it('returns [] without touching the cache when the tag endpoint answers 404 (not deployed)', async () => {
      vi.spyOn(NexusMarketplaceService, 'fetchListingTags').mockRejectedValue(
        Err.client(ClientErrorCode.NOT_FOUND, 'Not found', { service: ErrorService.Nexus, operation: 'fetchNexus' }),
      );
      const mergeSpy = vi.spyOn(LocalMarketplaceTagService, 'mergeTags');

      const result = await CommerceApplication.fetchMarketplaceTags({
        kind: TagKind.LISTING,
        taggedId: `${COMMERCE_FIXTURE_SELLER}:0034A0X7NJ52A`,
      });

      expect(result).toEqual([]);
      expect(mergeSpy).not.toHaveBeenCalled();
    });

    it('propagates non-404 errors', async () => {
      vi.spyOn(NexusMarketplaceService, 'fetchShopTags').mockRejectedValue(new Error('nexus unreachable'));

      await expect(
        CommerceApplication.fetchMarketplaceTags({ kind: TagKind.SHOP, taggedId: COMMERCE_FIXTURE_SELLER }),
      ).rejects.toThrow('nexus unreachable');
    });

    it('skips the merge when Nexus returns an empty aggregate', async () => {
      vi.spyOn(NexusMarketplaceService, 'fetchShopTags').mockResolvedValue([]);
      const mergeSpy = vi.spyOn(LocalMarketplaceTagService, 'mergeTags');

      const result = await CommerceApplication.fetchMarketplaceTags({
        kind: TagKind.SHOP,
        taggedId: COMMERCE_FIXTURE_SELLER,
      });

      expect(result).toEqual([]);
      expect(mergeSpy).not.toHaveBeenCalled();
    });
  });

  describe('fetchCatalogListings', () => {
    const SELLER_B = 'b'.repeat(52);
    const SELLER_B_SHOP_URL = `pubky://${SELLER_B}/pub/pubky.app/marketplace/v1/shop.json`;

    it('never reads from Nexus in sandbox mode', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('sandbox');
      const stream = vi.spyOn(NexusMarketplaceService, 'fetchListingStream');

      await CommerceApplication.fetchCatalogListings();

      expect(stream).not.toHaveBeenCalled();
    });

    it('passes server-side filters to the listing stream', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('unavailable');
      const stream = vi.spyOn(NexusMarketplaceService, 'fetchListingStream').mockResolvedValue([]);

      await CommerceApplication.fetchCatalogListings({ saleFormat: 'auction', condition: 'like_new' });

      expect(stream).toHaveBeenCalledWith({
        state: 'active',
        limit: 30,
        sale_format: 'auction',
        condition: 'like_new',
      });
    });

    it('requests the auction end-time stream for the ending-soonest catalog', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('unavailable');
      const stream = vi.spyOn(NexusMarketplaceService, 'fetchListingStream').mockResolvedValue([]);

      await CommerceApplication.fetchCatalogListings({ endingSoonest: true });

      expect(stream).toHaveBeenCalledWith({
        state: 'active',
        limit: 30,
        sorting: 'ends_at',
        order: 'ascending',
      });
    });

    it('caches the validated index projections without hydrating listings from homeservers', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('unavailable');
      vi.spyOn(NexusMarketplaceService, 'fetchListingStream').mockResolvedValue([
        createNexusListingDetailsFixture(),
        createNexusAuctionListingDetailsFixture(),
      ]);
      vi.spyOn(LocalCommerceService, 'getShop').mockResolvedValue(
        new CommerceShopModel({
          id: COMMERCE_FIXTURE_SELLER,
          owner_id: COMMERCE_FIXTURE_SELLER,
          record: createCommerceShopFixture(),
          revision: 1,
          sync_status: 'synced',
          updated_at: 1_000,
        }),
      );
      const bulkUpsert = vi.spyOn(LocalCommerceService, 'bulkUpsertCatalogEntries').mockResolvedValue(undefined);
      const fetchJson = vi.spyOn(CommerceHomeserverService, 'fetchJson');
      const upsertListing = vi.spyOn(LocalCommerceService, 'upsertListing');

      await CommerceApplication.fetchCatalogListings();

      expect(bulkUpsert).toHaveBeenCalledExactlyOnceWith([
        expect.objectContaining({ id: `${COMMERCE_FIXTURE_SELLER}:boots_01`, sale_format: 'fixed_price' }),
        expect.objectContaining({
          id: `${COMMERCE_FIXTURE_SELLER}:rangefinder_camera`,
          sale_format: 'auction',
          auction: expect.objectContaining({ endsAt: '2026-08-29T20:00:00.000Z' }),
        }),
      ]);
      expect(fetchJson).not.toHaveBeenCalled();
      expect(upsertListing).not.toHaveBeenCalled();
    });

    it('hydrates only shop records the cache is missing, deduplicated per seller', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('unavailable');
      vi.spyOn(NexusMarketplaceService, 'fetchListingStream').mockResolvedValue([
        createNexusListingDetailsFixture(),
        createNexusListingDetailsFixture({ owner_id: SELLER_B, id: 'jacket_01' }),
        createNexusListingDetailsFixture({ owner_id: SELLER_B, id: 'scarf_01' }),
      ]);
      vi.spyOn(LocalCommerceService, 'bulkUpsertCatalogEntries').mockResolvedValue(undefined);
      vi.spyOn(LocalCommerceService, 'getShop').mockImplementation(async (ownerId) =>
        ownerId === COMMERCE_FIXTURE_SELLER
          ? new CommerceShopModel({
              id: COMMERCE_FIXTURE_SELLER,
              owner_id: COMMERCE_FIXTURE_SELLER,
              record: createCommerceShopFixture(),
              revision: 1,
              sync_status: 'synced',
              updated_at: 1_000,
            })
          : null,
      );
      const sellerBShop = createCommerceShopFixture({ ownerPubky: SELLER_B, name: 'Block 9 Archive' });
      const fetchJson = vi.spyOn(CommerceHomeserverService, 'fetchJson').mockResolvedValue(sellerBShop);
      const upsertShop = vi.spyOn(LocalCommerceService, 'upsertShop').mockResolvedValue(undefined);

      await CommerceApplication.fetchCatalogListings();

      expect(fetchJson).toHaveBeenCalledExactlyOnceWith(SELLER_B_SHOP_URL);
      expect(upsertShop).toHaveBeenCalledExactlyOnceWith(sellerBShop, 'synced');
    });

    it('keeps the discovered catalog when one seller shop is unreachable', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('unavailable');
      vi.spyOn(NexusMarketplaceService, 'fetchListingStream').mockResolvedValue([
        createNexusListingDetailsFixture(),
        createNexusListingDetailsFixture({ owner_id: SELLER_B, id: 'jacket_01' }),
      ]);
      const bulkUpsert = vi.spyOn(LocalCommerceService, 'bulkUpsertCatalogEntries').mockResolvedValue(undefined);
      vi.spyOn(LocalCommerceService, 'getShop').mockResolvedValue(null);
      const sellerAShop = createCommerceShopFixture();
      vi.spyOn(CommerceHomeserverService, 'fetchJson').mockImplementation(async (url) => {
        if (url.startsWith(`pubky://${SELLER_B}/`)) throw new TypeError('seller homeserver unreachable');
        return sellerAShop;
      });
      const upsertShop = vi.spyOn(LocalCommerceService, 'upsertShop').mockResolvedValue(undefined);

      await expect(CommerceApplication.fetchCatalogListings()).resolves.toBeUndefined();

      expect(bulkUpsert).toHaveBeenCalledOnce();
      expect(upsertShop).toHaveBeenCalledExactlyOnceWith(sellerAShop, 'synced');
    });

    it('propagates a Nexus failure without touching the cache', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('unavailable');
      vi.spyOn(NexusMarketplaceService, 'fetchListingStream').mockRejectedValue(new Error('nexus unreachable'));
      const bulkUpsert = vi.spyOn(LocalCommerceService, 'bulkUpsertCatalogEntries');
      const upsertShop = vi.spyOn(LocalCommerceService, 'upsertShop');

      await expect(CommerceApplication.fetchCatalogListings()).rejects.toThrow('nexus unreachable');
      expect(bulkUpsert).not.toHaveBeenCalled();
      expect(upsertShop).not.toHaveBeenCalled();
    });

    it('rejects an invalid stream payload before caching anything', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('unavailable');
      vi.spyOn(NexusMarketplaceService, 'fetchListingStream').mockResolvedValue([
        createNexusAuctionListingDetailsFixture({ auction_ends_at: null }),
      ]);
      const bulkUpsert = vi.spyOn(LocalCommerceService, 'bulkUpsertCatalogEntries');

      await expect(CommerceApplication.fetchCatalogListings()).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      expect(bulkUpsert).not.toHaveBeenCalled();
    });
  });

  describe('getOrFetchListing revision freshness', () => {
    function cachedListingModel(revision: number) {
      const record = createCommerceListingFixture({ revision });
      return new CommerceListingModel({
        id: `${COMMERCE_FIXTURE_SELLER}:boots_01`,
        seller_id: COMMERCE_FIXTURE_SELLER,
        listing_id: 'boots_01',
        record,
        revision,
        state: 'active',
        category_id: 'fashion-shoes-boots',
        format: 'fixed_price',
        currency: 'USD',
        price_minor: 12_500,
        sync_status: 'synced',
        updated_at: Date.parse(record.updatedAt),
      });
    }

    it('returns a cached listing without fetching when the index has seen nothing newer', async () => {
      const cached = cachedListingModel(1);
      vi.spyOn(LocalCommerceService, 'getListing').mockResolvedValue(cached);
      vi.spyOn(LocalCommerceService, 'getCatalogEntry').mockResolvedValue(
        new CommerceCatalogEntryModel(createCommerceCatalogEntryFixture({ revision: 1 })),
      );
      const fetchJson = vi.spyOn(CommerceHomeserverService, 'fetchJson');

      await expect(CommerceApplication.getOrFetchListing(COMMERCE_FIXTURE_SELLER, 'boots_01')).resolves.toEqual(
        cached.record,
      );
      expect(fetchJson).not.toHaveBeenCalled();
    });

    it('refetches the canonical record when the index revision moved past the cache', async () => {
      vi.spyOn(LocalCommerceService, 'getListing').mockResolvedValue(cachedListingModel(1));
      vi.spyOn(LocalCommerceService, 'getCatalogEntry').mockResolvedValue(
        new CommerceCatalogEntryModel(createCommerceCatalogEntryFixture({ revision: 2 })),
      );
      const refreshedRecord = createCommerceListingFixture({ revision: 2 });
      vi.spyOn(CommerceHomeserverService, 'fetchJson').mockResolvedValue(refreshedRecord);
      const upsertListing = vi.spyOn(LocalCommerceService, 'upsertListing').mockResolvedValue(undefined);

      await expect(CommerceApplication.getOrFetchListing(COMMERCE_FIXTURE_SELLER, 'boots_01')).resolves.toEqual(
        refreshedRecord,
      );
      expect(upsertListing).toHaveBeenCalledExactlyOnceWith(refreshedRecord, 'synced');
    });

    it('serves the cached record when a staleness refresh fails', async () => {
      const cached = cachedListingModel(1);
      vi.spyOn(LocalCommerceService, 'getListing').mockResolvedValue(cached);
      vi.spyOn(LocalCommerceService, 'getCatalogEntry').mockResolvedValue(
        new CommerceCatalogEntryModel(createCommerceCatalogEntryFixture({ revision: 2 })),
      );
      vi.spyOn(CommerceHomeserverService, 'fetchJson').mockRejectedValue(new TypeError('homeserver unreachable'));

      await expect(CommerceApplication.getOrFetchListing(COMMERCE_FIXTURE_SELLER, 'boots_01')).resolves.toEqual(
        cached.record,
      );
    });

    it('propagates a fetch failure when no cached record exists', async () => {
      vi.spyOn(LocalCommerceService, 'getListing').mockResolvedValue(null);
      vi.spyOn(LocalCommerceService, 'getCatalogEntry').mockResolvedValue(null);
      vi.spyOn(CommerceHomeserverService, 'fetchJson').mockRejectedValue(new TypeError('homeserver unreachable'));

      await expect(CommerceApplication.getOrFetchListing(COMMERCE_FIXTURE_SELLER, 'boots_01')).rejects.toThrow(
        'homeserver unreachable',
      );
    });
  });
});
