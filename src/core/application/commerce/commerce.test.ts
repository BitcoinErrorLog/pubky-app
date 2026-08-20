import { afterEach, describe, expect, it, vi } from 'vitest';
import * as commerceConfig from '@/config/commerce';
import { CommerceListingModel, CommerceShopModel } from '@/models/commerce/commerce.models';
import { CommerceHomeserverService } from '@/services/homeserver/commerce/commerce';
import { LocalCommerceService } from '@/services/local/commerce/commerce';
import { MarketplaceGatewayService } from '@/services/marketplace/marketplace';
import { NexusMarketplaceService } from '@/services/nexus/marketplace/marketplace';
import {
  COMMERCE_FIXTURE_SELLER,
  createCommerceListingFixture,
  createCommerceShopFixture,
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

  describe('fetchCatalogListings', () => {
    const SELLER_B = 'b'.repeat(52);
    const JACKET_URL = `pubky://${SELLER_B}/pub/pubky.app/marketplace/v1/listings/jacket_01`;
    const SELLER_B_SHOP_URL = `pubky://${SELLER_B}/pub/pubky.app/marketplace/v1/shop.json`;

    const jacketRecord = createCommerceListingFixture({
      ownerPubky: SELLER_B,
      listingId: 'jacket_01',
      media: [
        {
          id: 'image_01',
          type: 'image',
          url: `pubky://${SELLER_B}/pub/pubky.app/marketplace/v1/media/image_01`,
          contentHash: 'a'.repeat(64),
          mimeType: 'image/jpeg',
          byteSize: 10_000,
          width: 1_200,
          height: 1_600,
          altText: 'Selvedge denim jacket',
        },
      ],
    });

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

    it('hydrates discovered listings and shops from the canonical homeserver, skipping fresh cache entries', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('unavailable');
      vi.spyOn(NexusMarketplaceService, 'fetchListingStream').mockResolvedValue([
        createNexusListingDetailsFixture(),
        createNexusListingDetailsFixture({ owner_id: SELLER_B, id: 'jacket_01' }),
      ]);
      vi.spyOn(LocalCommerceService, 'getListing').mockImplementation(async (id) =>
        id === `${COMMERCE_FIXTURE_SELLER}:boots_01` ? cachedListingModel(1) : null,
      );
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
      const fetchJson = vi
        .spyOn(CommerceHomeserverService, 'fetchJson')
        .mockImplementation(async (url) => (url === JACKET_URL ? jacketRecord : sellerBShop));
      const upsertListing = vi.spyOn(LocalCommerceService, 'upsertListing').mockResolvedValue(undefined);
      const upsertShop = vi.spyOn(LocalCommerceService, 'upsertShop').mockResolvedValue(undefined);

      await CommerceApplication.fetchCatalogListings();

      expect(fetchJson).toHaveBeenCalledWith(JACKET_URL);
      expect(fetchJson).toHaveBeenCalledWith(SELLER_B_SHOP_URL);
      expect(fetchJson).toHaveBeenCalledTimes(2);
      expect(upsertListing).toHaveBeenCalledExactlyOnceWith(jacketRecord, 'synced');
      expect(upsertShop).toHaveBeenCalledExactlyOnceWith(sellerBShop, 'synced');
    });

    it('refetches a cached listing whose revision fell behind the index', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('unavailable');
      vi.spyOn(NexusMarketplaceService, 'fetchListingStream').mockResolvedValue([
        createNexusListingDetailsFixture({ revision: 2 }),
      ]);
      vi.spyOn(LocalCommerceService, 'getListing').mockResolvedValue(cachedListingModel(1));
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
      const refreshedRecord = createCommerceListingFixture({ revision: 2 });
      vi.spyOn(CommerceHomeserverService, 'fetchJson').mockResolvedValue(refreshedRecord);
      const upsertListing = vi.spyOn(LocalCommerceService, 'upsertListing').mockResolvedValue(undefined);

      await CommerceApplication.fetchCatalogListings();

      expect(upsertListing).toHaveBeenCalledExactlyOnceWith(refreshedRecord, 'synced');
    });

    it('keeps hydrating the rest of the catalog when one seller is unreachable', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('unavailable');
      vi.spyOn(NexusMarketplaceService, 'fetchListingStream').mockResolvedValue([
        createNexusListingDetailsFixture({ owner_id: SELLER_B, id: 'jacket_01' }),
        createNexusListingDetailsFixture({ revision: 2 }),
      ]);
      vi.spyOn(LocalCommerceService, 'getListing').mockResolvedValue(null);
      vi.spyOn(LocalCommerceService, 'getShop').mockResolvedValue(null);
      const bootsRecord = createCommerceListingFixture({ revision: 2 });
      const sellerAShop = createCommerceShopFixture();
      vi.spyOn(CommerceHomeserverService, 'fetchJson').mockImplementation(async (url) => {
        if (url.startsWith(`pubky://${SELLER_B}/`)) throw new TypeError('seller homeserver unreachable');
        return url.endsWith('shop.json') ? sellerAShop : bootsRecord;
      });
      const upsertListing = vi.spyOn(LocalCommerceService, 'upsertListing').mockResolvedValue(undefined);
      const upsertShop = vi.spyOn(LocalCommerceService, 'upsertShop').mockResolvedValue(undefined);

      await expect(CommerceApplication.fetchCatalogListings()).resolves.toBeUndefined();

      expect(upsertListing).toHaveBeenCalledExactlyOnceWith(bootsRecord, 'synced');
      expect(upsertShop).toHaveBeenCalledExactlyOnceWith(sellerAShop, 'synced');
    });

    it('propagates a Nexus failure without touching the cache', async () => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('unavailable');
      vi.spyOn(NexusMarketplaceService, 'fetchListingStream').mockRejectedValue(new Error('nexus unreachable'));
      const upsertListing = vi.spyOn(LocalCommerceService, 'upsertListing');
      const upsertShop = vi.spyOn(LocalCommerceService, 'upsertShop');

      await expect(CommerceApplication.fetchCatalogListings()).rejects.toThrow('nexus unreachable');
      expect(upsertListing).not.toHaveBeenCalled();
      expect(upsertShop).not.toHaveBeenCalled();
    });
  });

  it('returns an existing listing projection without fetching', async () => {
    const record = createCommerceListingFixture();
    vi.spyOn(LocalCommerceService, 'getListing').mockResolvedValue(
      new CommerceListingModel({
        id: `${COMMERCE_FIXTURE_SELLER}:boots_01`,
        seller_id: COMMERCE_FIXTURE_SELLER,
        listing_id: 'boots_01',
        record,
        revision: 1,
        state: 'active',
        category_id: 'fashion-shoes-boots',
        format: 'fixed_price',
        currency: 'USD',
        price_minor: 12_500,
        sync_status: 'synced',
        updated_at: Date.parse(record.updatedAt),
      }),
    );
    const fetchJson = vi.spyOn(CommerceHomeserverService, 'fetchJson');

    await expect(CommerceApplication.getOrFetchListing(COMMERCE_FIXTURE_SELLER, 'boots_01')).resolves.toEqual(record);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
