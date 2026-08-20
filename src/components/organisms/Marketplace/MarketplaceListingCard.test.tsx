import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createCommerceSandboxCatalog } from '@/libs/commerce/sandbox-catalog';
import type { CommerceListingModelSchema } from '@/models/commerce/commerce.schema';
import { MarketplaceListingCard } from './MarketplaceListingCard';

function listingModel(index = 0): CommerceListingModelSchema {
  const record = createCommerceSandboxCatalog().listings[index];
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

describe('MarketplaceListingCard', () => {
  it('renders listing terms and canonical detail link', () => {
    const listing = listingModel();
    render(<MarketplaceListingCard listing={listing} shopName="Satoshi Vintage" />);

    expect(screen.getByRole('heading', { name: 'Vintage leather boots' })).toBeInTheDocument();
    expect(screen.getByText('$125.00')).toBeInTheDocument();
    expect(screen.getByText('Satoshi Vintage')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Vintage leather boots' })).toHaveAttribute(
      'href',
      `/marketplace/listing/${listing.seller_id}/${listing.listing_id}`,
    );
  });

  it('renders auction timing without claiming a fixed price', () => {
    render(<MarketplaceListingCard listing={listingModel(2)} shopName="Proof of Film" />);

    expect(screen.getByText('Auction')).toBeInTheDocument();
    expect(screen.getByText('Ends Aug 29')).toBeInTheDocument();
  });

  it('renders the horizontal card variant for list layout', () => {
    render(<MarketplaceListingCard listing={listingModel()} layout="list" />);

    expect(screen.getByTestId('card')).toHaveClass('flex-row');
  });
});

describe('MarketplaceListingCard - Snapshots', () => {
  it('matches the fixed-price listing snapshot', () => {
    const { container } = render(<MarketplaceListingCard listing={listingModel()} shopName="Satoshi Vintage" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
