import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommerceListingRecord, CommerceShopRecord } from '@/libs/commerce/marketplace-records';
import type { CommerceListingModelSchema } from '@/models/commerce/commerce.schema';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import { createCommerceListingFixture, createCommerceShopFixture } from '@/test/fixtures/commerce/commerce';
import { useMarketplaceCatalog } from './useMarketplaceCatalog';

const mockGetAllListings = vi.fn();
const mockGetAllShops = vi.fn();
const mockFetchCatalogListings = vi.fn();
vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getAllListings: () => mockGetAllListings(),
    getAllShops: () => mockGetAllShops(),
    fetchCatalogListings: (filters: unknown) => mockFetchCatalogListings(filters),
  },
}));

const mockGetCommerceAdapterMode = vi.fn();
vi.mock('@/config/commerce', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/commerce')>();
  return {
    ...actual,
    getCommerceAdapterMode: () => mockGetCommerceAdapterMode(),
  };
});

// The mocked controller reads return plain values, so the live query can hand
// them straight back; `undefined` models a cache read that has not resolved.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (queryFn: () => unknown) => queryFn(),
}));

function toListingModel(record: CommerceListingRecord): CommerceListingModelSchema {
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
    sync_status: 'synced',
    updated_at: Date.parse(record.updatedAt),
  };
}

function toShopModel(record: CommerceShopRecord) {
  return { id: record.ownerPubky, owner_id: record.ownerPubky, record };
}

describe('useMarketplaceCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCommerceStore.getState().reset();
    mockGetCommerceAdapterMode.mockReturnValue('unavailable');
    mockGetAllListings.mockReturnValue([]);
    mockGetAllShops.mockReturnValue([]);
    mockFetchCatalogListings.mockResolvedValue(undefined);
  });

  it('renders cached listings immediately while the Nexus refresh is still in flight', async () => {
    const cached = toListingModel(createCommerceListingFixture());
    mockGetAllListings.mockReturnValue([cached]);
    mockGetAllShops.mockReturnValue([toShopModel(createCommerceShopFixture())]);
    mockFetchCatalogListings.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useMarketplaceCatalog());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.listings).toEqual([cached]);
    expect(result.current.shopsBySeller.get(cached.seller_id)?.name).toBe('Satoshi Vintage');
    await waitFor(() => expect(mockFetchCatalogListings).toHaveBeenCalledWith({ saleFormat: 'all', conditions: [] }));
  });

  it('stays in the loading state over an empty cache until the first refresh settles', async () => {
    let rejectRefresh: ((reason: Error) => void) | undefined;
    mockFetchCatalogListings.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRefresh = reject;
      }),
    );

    const { result } = renderHook(() => useMarketplaceCatalog());

    expect(result.current.isLoading).toBe(true);

    act(() => rejectRefresh?.(new Error('nexus unreachable')));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.listings).toEqual([]);
  });

  it('keeps rendering the cached catalog when the Nexus refresh fails', async () => {
    const cached = toListingModel(createCommerceListingFixture());
    mockGetAllListings.mockReturnValue([cached]);
    mockFetchCatalogListings.mockRejectedValue(new Error('nexus unreachable'));

    const { result } = renderHook(() => useMarketplaceCatalog());

    await waitFor(() => expect(mockFetchCatalogListings).toHaveBeenCalled());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.listings).toEqual([cached]);
  });

  it('never queries Nexus in sandbox mode and reads only the seeded cache', () => {
    mockGetCommerceAdapterMode.mockReturnValue('sandbox');
    const cached = toListingModel(createCommerceListingFixture());
    mockGetAllListings.mockReturnValue([cached]);

    const { result } = renderHook(() => useMarketplaceCatalog());

    expect(mockFetchCatalogListings).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.listings).toEqual([cached]);
    expect(result.current.adapterMode).toBe('sandbox');
  });

  it('refetches from Nexus when server-side filters change', async () => {
    renderHook(() => useMarketplaceCatalog());

    await waitFor(() => expect(mockFetchCatalogListings).toHaveBeenCalledWith({ saleFormat: 'all', conditions: [] }));

    act(() => useCommerceStore.getState().setSaleFormat('auction'));

    await waitFor(() =>
      expect(mockFetchCatalogListings).toHaveBeenLastCalledWith({ saleFormat: 'auction', conditions: [] }),
    );
    expect(mockFetchCatalogListings).toHaveBeenCalledTimes(2);
  });
});
