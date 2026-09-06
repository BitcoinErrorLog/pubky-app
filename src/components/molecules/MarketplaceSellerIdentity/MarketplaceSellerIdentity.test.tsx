import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketplaceSellerIdentity } from './MarketplaceSellerIdentity';

describe('MarketplaceSellerIdentity', () => {
  it('does not render a shop-opened tenure line', () => {
    render(
      <MarketplaceSellerIdentity
        sellerPubky={'s'.repeat(52)}
        displayName="Satoshi Vintage"
        reputation={{ status: 'new_seller' }}
      />,
    );

    expect(screen.getByText('Sold by')).toBeInTheDocument();
    expect(screen.getByText('Satoshi Vintage')).toBeInTheDocument();
    expect(screen.queryByText(/Shop opened/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Seller-stated/)).not.toBeInTheDocument();
  });
});
