// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';
import { MarketplaceListingCard } from '@/organisms/Marketplace/MarketplaceListingCard';

/**
 * Card-level scenarios for catalog cards rendered purely from Nexus index
 * entries (no hydrated homeserver record, no live bid state). The full
 * Marketplace template keeps its hero above the fold, so these render the
 * bare grid to keep every card term visible in the capture.
 */
const fixtures = vi.hoisted(async () => {
  const { catalogItemFromCatalogEntry, filterMarketplaceCatalog } =
    await import('@/hooks/useMarketplaceCatalog/useMarketplaceCatalog.utils');
  const { createCommerceCatalogEntryFixture } = await import('@/test/fixtures/commerce/commerce');

  const auctionWithTerms = catalogItemFromCatalogEntry(
    createCommerceCatalogEntryFixture({
      id: `${'n'.repeat(52)}:rangefinder_camera`,
      seller_id: 'n'.repeat(52),
      listing_id: 'rangefinder_camera',
      title: '35mm rangefinder camera',
      description: 'Recently serviced mechanical rangefinder with bright optics.',
      category_id: 'electronics-cameras-film',
      condition: 'excellent',
      tags: ['film', 'camera'],
      sale_format: 'auction',
      price: { amountMinor: 4_500, currency: 'USD', exponent: 2 },
      auction: {
        startsAt: '2026-08-19T20:00:00.000Z',
        endsAt: '2026-08-29T20:00:00.000Z',
        reservePrice: { amountMinor: 6_500, currency: 'USD', exponent: 2 },
        buyNowPrice: { amountMinor: 12_500, currency: 'USD', exponent: 2 },
        minimumIncrement: { amountMinor: 500, currency: 'USD', exponent: 2 },
      },
      updated_at: Date.parse('2026-08-19T21:02:00.000Z'),
    }),
  );

  // An auction whose Nexus index row predates the auction-term fields: the
  // card renders the terms it actually has (starting bid) and omits the end
  // date and buy-now badges instead of inventing them.
  const auctionMissingTerms = catalogItemFromCatalogEntry(
    createCommerceCatalogEntryFixture({
      id: `${'m'.repeat(52)}:mystery_auction`,
      seller_id: 'm'.repeat(52),
      listing_id: 'mystery_auction',
      title: 'Estate lot mystery auction',
      description: 'Auction indexed before Nexus carried auction terms.',
      category_id: 'collectibles-music-vinyl',
      condition: 'fair',
      tags: ['estate', 'lot'],
      sale_format: 'auction',
      price: { amountMinor: 2_500, currency: 'USD', exponent: 2 },
      auction: null,
      updated_at: Date.parse('2026-08-19T21:30:00.000Z'),
    }),
  );

  const auctionEndingSooner = catalogItemFromCatalogEntry(
    createCommerceCatalogEntryFixture({
      id: `${'g'.repeat(52)}:silver_signet`,
      seller_id: 'g'.repeat(52),
      listing_id: 'silver_signet',
      title: 'Brutalist silver signet',
      description: 'Solid recycled silver ring cast and finished by hand.',
      category_id: 'fashion-jewelry-rings',
      condition: 'new',
      tags: ['silver', 'handmade'],
      sale_format: 'auction',
      price: { amountMinor: 12_000, currency: 'USD', exponent: 2 },
      auction: {
        startsAt: '2026-08-19T20:00:00.000Z',
        endsAt: '2026-08-22T20:00:00.000Z',
        reservePrice: null,
        buyNowPrice: null,
        minimumIncrement: { amountMinor: 500, currency: 'USD', exponent: 2 },
      },
      updated_at: Date.parse('2026-08-19T21:06:00.000Z'),
    }),
  );

  const fixedPrice = catalogItemFromCatalogEntry(createCommerceCatalogEntryFixture());

  return {
    termStates: [auctionWithTerms, auctionMissingTerms, fixedPrice],
    endingSoon: filterMarketplaceCatalog([fixedPrice, auctionWithTerms, auctionMissingTerms, auctionEndingSooner], {
      query: '',
      categoryId: null,
      saleFormat: 'all',
      conditions: [],
      minimumPriceMinor: null,
      maximumPriceMinor: null,
      sort: 'ending_soon',
    }),
    shopNames: new Map([
      [auctionWithTerms.sellerId, 'Proof of Film'],
      [auctionEndingSooner.sellerId, 'Low Time Preference'],
      [fixedPrice.sellerId, 'Satoshi Vintage'],
    ]),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace',
}));

describe('Marketplace listing cards — visual regression', () => {
  it('renders index-entry auction cards with terms, missing terms, and a fixed-price control at desktop viewport', async () => {
    const { termStates, shopNames } = await fixtures;
    const screen = await renderForVRT(
      <div className="grid grid-cols-4 gap-5 p-6">
        {termStates.map((listing) => (
          <MarketplaceListingCard key={listing.id} listing={listing} shopName={shopNames.get(listing.sellerId)} />
        ))}
      </div>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-cards-auction-terms-desktop');
  });

  it('renders the ending-soon ordering with a term-less auction after known end times at desktop viewport', async () => {
    const { endingSoon, shopNames } = await fixtures;
    const screen = await renderForVRT(
      <div className="grid grid-cols-4 gap-5 p-6">
        {endingSoon.map((listing) => (
          <MarketplaceListingCard key={listing.id} listing={listing} shopName={shopNames.get(listing.sellerId)} />
        ))}
      </div>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-cards-ending-soon-desktop');
  });
});
