import { afterEach, describe, expect, it, vi } from 'vitest';
import * as commerceConfig from '@/config/commerce';
import { CommerceListingModel, CommerceShopModel } from '@/models/commerce/commerce.models';
import { CommerceHomeserverService } from '@/services/homeserver/commerce/commerce';
import { LocalCommerceService } from '@/services/local/commerce/commerce';
import { MarketplaceGatewayService } from '@/services/marketplace/marketplace';
import {
  COMMERCE_FIXTURE_SELLER,
  createCommerceListingFixture,
  createCommerceShopFixture,
} from '@/test/fixtures/commerce/commerce';
import { CommerceApplication } from './commerce';

const SHOP_URL = `pubky://${COMMERCE_FIXTURE_SELLER}/pub/pubky.app/marketplace/v1/shop.json`;
const LISTING_URL = `pubky://${COMMERCE_FIXTURE_SELLER}/pub/pubky.app/marketplace/v1/listings/boots_01.json`;

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
