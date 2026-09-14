import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CommerceListingRecord } from '@/libs/commerce/marketplace-records';
import type { MarketplaceOffer } from '@/services/marketplace/marketplace';
import { OfferListingSummary, offerStateLabel, parseListingAggregateId } from './MarketplaceOffers';

const getOrFetchListing = vi.hoisted(() => vi.fn());

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: { getOrFetchListing },
}));

vi.mock('@/hooks/useMarketplaceMediaUrl/useMarketplaceMediaUrl', () => ({
  useMarketplaceFirstMediaUrl: (uris: readonly string[]) => uris[0] ?? null,
}));

const seller = 's'.repeat(52);
const offer = {
  id: '018f47d2-6a27-7c23-b51e-000000000001',
  aggregateId: 'offer:018f47d2-6a27-7c23-b51e-000000000002',
  listingAggregateId: `listing:${seller}_boots`,
  buyerPubky: 'b'.repeat(52),
  sellerPubky: seller,
  revision: 1,
  state: 'accepted',
  offeredBy: 'b'.repeat(52),
  amount: { amountMinor: 1000, currency: 'USD', exponent: 2 },
  quantity: 1,
  message: '',
  expiresAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
} as MarketplaceOffer;

describe('Marketplace offers UX', () => {
  it('labels an accepted offer as expired after its expiry without changing its state', () => {
    expect(offerStateLabel('accepted', '2026-09-13T00:00:00.000Z', Date.parse('2026-09-14T00:00:00.000Z'))).toBe(
      'Expired',
    );
    expect(offer.state).toBe('accepted');
  });

  it('parses listing references into the listing route parts', () => {
    expect(parseListingAggregateId(offer.listingAggregateId)).toEqual({ sellerPubky: seller, listingId: 'boots' });
  });

  it('shows the fetched listing title and thumbnail as a listing link', async () => {
    getOrFetchListing.mockResolvedValue({
      title: 'Vintage boots',
      media: [{ type: 'image', url: 'https://cdn.example/boots.jpg' }],
    } as CommerceListingRecord);

    render(<OfferListingSummary offer={offer} />);

    await waitFor(() => expect(screen.getByRole('link', { name: /Vintage boots/ })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Vintage boots/ })).toHaveAttribute(
      'href',
      `/marketplace/listing/${seller}/boots`,
    );
    expect(screen.getByRole('img', { name: 'Vintage boots thumbnail' })).toBeInTheDocument();
  });
});
