import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  buildMarketplaceCatalogItems,
  catalogItemFromCatalogEntry,
  type MarketplaceCatalogItem,
} from '@/hooks/useMarketplaceCatalog/useMarketplaceCatalog.utils';
import { createCommerceSandboxCatalog } from '@/libs/commerce/sandbox-catalog';
import { createCommerceCatalogEntryFixture } from '@/test/fixtures/commerce/commerce';
import { toCommerceListingModel } from '@/test/fixtures/commerce/listing-models';
import { MarketplaceListingCard } from './MarketplaceListingCard';

function catalogItem(index = 0): MarketplaceCatalogItem {
  const record = createCommerceSandboxCatalog().listings[index];
  return buildMarketplaceCatalogItems([toCommerceListingModel(record)], [])[0];
}

describe('MarketplaceListingCard', () => {
  it('renders listing terms and canonical detail link', () => {
    const listing = catalogItem();
    render(<MarketplaceListingCard listing={listing} shopName="Satoshi Vintage" />);

    expect(screen.getByRole('heading', { name: 'Vintage leather boots' })).toBeInTheDocument();
    expect(screen.getByText('$125.00')).toBeInTheDocument();
    expect(screen.getByText('Satoshi Vintage')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Vintage leather boots' })).toHaveAttribute(
      'href',
      `/marketplace/listing/${listing.sellerId}/${listing.listingId}`,
    );
  });

  it('labels the auction price as a starting bid instead of claiming a current price', () => {
    render(<MarketplaceListingCard listing={catalogItem(2)} shopName="Proof of Film" />);

    expect(screen.getByText('Auction')).toBeInTheDocument();
    expect(screen.getByText('Ends Aug 29')).toBeInTheDocument();
    expect(screen.getByText('Starting bid')).toBeInTheDocument();
    expect(screen.getByText('$45.00')).toBeInTheDocument();
    expect(screen.getByText('Buy now $125.00')).toBeInTheDocument();
    expect(screen.queryByText(/current bid/i)).not.toBeInTheDocument();
  });

  it('renders an auction whose stale index row lacks terms without inventing them', () => {
    const listing = catalogItemFromCatalogEntry(
      createCommerceCatalogEntryFixture({ sale_format: 'auction', auction: null }),
    );
    render(<MarketplaceListingCard listing={listing} shopName="Satoshi Vintage" />);

    expect(screen.getByText('Auction')).toBeInTheDocument();
    expect(screen.getByText('Starting bid')).toBeInTheDocument();
    expect(screen.getByText('$125.00')).toBeInTheDocument();
    expect(screen.queryByText(/^Ends /)).not.toBeInTheDocument();
    expect(screen.queryByText(/Buy now/)).not.toBeInTheDocument();
  });

  it('renders the horizontal card variant for list layout', () => {
    render(<MarketplaceListingCard listing={catalogItem()} layout="list" />);

    expect(screen.getByTestId('card')).toHaveClass('flex-row');
  });
});

describe('MarketplaceListingCard - Snapshots', () => {
  it('matches the fixed-price listing snapshot', () => {
    const { container } = render(<MarketplaceListingCard listing={catalogItem()} shopName="Satoshi Vintage" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the auction listing snapshot rendered from an index entry', () => {
    const listing = catalogItemFromCatalogEntry(
      createCommerceCatalogEntryFixture({
        id: `${'y'.repeat(52)}:rangefinder_camera`,
        listing_id: 'rangefinder_camera',
        title: '35mm rangefinder camera',
        category_id: 'electronics-cameras-film',
        condition: 'excellent',
        sale_format: 'auction',
        price: { amountMinor: 4_500, currency: 'USD', exponent: 2 },
        auction: {
          startsAt: '2026-08-19T20:00:00.000Z',
          endsAt: '2026-08-29T20:00:00.000Z',
          reservePrice: { amountMinor: 6_500, currency: 'USD', exponent: 2 },
          buyNowPrice: { amountMinor: 12_500, currency: 'USD', exponent: 2 },
          minimumIncrement: { amountMinor: 500, currency: 'USD', exponent: 2 },
        },
      }),
    );
    const { container } = render(<MarketplaceListingCard listing={listing} shopName="Proof of Film" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
