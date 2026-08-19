import { describe, expect, it } from 'vitest';
import { createCommerceSandboxCatalog } from '@/libs/commerce/sandbox-catalog';
import type { CommerceListingModelSchema } from '@/models/commerce/commerce.schema';
import { filterMarketplaceCatalog, type MarketplaceCatalogFilters } from './useMarketplaceCatalog.utils';

function catalogModels(): CommerceListingModelSchema[] {
  return createCommerceSandboxCatalog().listings.map((record) => {
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
  });
}

function filters(overrides: Partial<MarketplaceCatalogFilters> = {}): MarketplaceCatalogFilters {
  return {
    query: '',
    categoryId: null,
    saleFormat: 'all',
    conditions: [],
    minimumPriceMinor: null,
    maximumPriceMinor: null,
    sort: 'newest',
    ...overrides,
  };
}

describe('filterMarketplaceCatalog', () => {
  it('searches title, description, and tags case-insensitively', () => {
    const results = filterMarketplaceCatalog(catalogModels(), filters({ query: 'JAZZ' }));

    expect(results.map(({ listing_id }) => listing_id)).toEqual(['jazz_first_press']);
  });

  it('matches a category subtree', () => {
    const results = filterMarketplaceCatalog(catalogModels(), filters({ categoryId: 'fashion-shoes' }));

    expect(results.map(({ listing_id }) => listing_id).sort()).toEqual(['leather_boots', 'trail_runners']);
  });

  it('combines format, condition, and inclusive price filters', () => {
    const results = filterMarketplaceCatalog(
      catalogModels(),
      filters({
        saleFormat: 'fixed_price',
        conditions: ['excellent'],
        minimumPriceMinor: 8_000,
        maximumPriceMinor: 14_000,
      }),
    );

    expect(results.map(({ listing_id }) => listing_id).sort()).toEqual(['mechanical_keyboard', 'selvedge_jacket']);
  });

  it('sorts price in both directions', () => {
    const low = filterMarketplaceCatalog(catalogModels(), filters({ sort: 'price_low' }));
    const high = filterMarketplaceCatalog(catalogModels(), filters({ sort: 'price_high' }));

    expect(low[0].listing_id).toBe('jazz_first_press');
    expect(high[0].listing_id).toBe('mechanical_keyboard');
  });

  it('puts active auctions before fixed-price listings for ending-soon', () => {
    const results = filterMarketplaceCatalog(catalogModels(), filters({ sort: 'ending_soon' }));

    expect(results.slice(0, 2).every(({ format }) => format === 'auction')).toBe(true);
  });
});
