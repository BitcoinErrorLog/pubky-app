import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CommerceListingRecord } from '@/libs/commerce/marketplace-records';
import type { MarketplaceOffer } from '@/services/marketplace/marketplace';
import {
  isLinkedOfferMissing,
  loadOfferListings,
  OfferListingSummary,
  offerStateLabel,
  parseListingAggregateId,
} from './MarketplaceOffers';

const getOrFetchListing = vi.hoisted(() => vi.fn());
const getManyListings = vi.hoisted(() => vi.fn());

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: { getManyListings, getOrFetchListing },
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

  it('shows a hydrated listing title and thumbnail as a listing link', async () => {
    const listing = {
      title: 'Vintage boots',
      media: [{ type: 'image', url: 'https://cdn.example/boots.jpg' }],
    } as CommerceListingRecord;

    render(<OfferListingSummary offer={offer} listing={listing} />);

    await waitFor(() => expect(screen.getByRole('link', { name: /Vintage boots/ })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Vintage boots/ })).toHaveAttribute(
      'href',
      `/marketplace/listing/${seller}/boots`,
    );
    expect(screen.getByRole('img', { name: 'Vintage boots thumbnail' })).toBeInTheDocument();
  });

  it('uses local listings without fetching', async () => {
    const listing = { title: 'Local boots', media: [] } as unknown as CommerceListingRecord;
    getManyListings.mockResolvedValue(new Map([[`${seller}:boots`, { record: listing }]]));

    await expect(loadOfferListings([offer])).resolves.toEqual(new Map([[`${seller}:boots`, listing]]));
    expect(getOrFetchListing).not.toHaveBeenCalled();
  });

  it('hydrates each missing listing exactly once and deduplicates duplicate offers', async () => {
    getManyListings.mockResolvedValue(new Map());
    getOrFetchListing.mockImplementation(async (_seller: string, listingId: string) => ({
      title: listingId,
      media: [],
    }));

    const second = { ...offer, id: 'second', listingAggregateId: `listing:${seller}_camera` } as MarketplaceOffer;
    await loadOfferListings([offer, second, offer]);

    expect(getOrFetchListing).toHaveBeenCalledTimes(2);
    expect(getOrFetchListing).toHaveBeenCalledWith(seller, 'boots');
    expect(getOrFetchListing).toHaveBeenCalledWith(seller, 'camera');
  });

  it('shows the missing-offer fallback only for a loaded, unmatched anchor', () => {
    expect(isLinkedOfferMissing('missing', [offer], false, null)).toBe(true);
    expect(isLinkedOfferMissing(offer.id, [offer], false, null)).toBe(false);
    expect(isLinkedOfferMissing('missing', [], true, null)).toBe(false);
    expect(isLinkedOfferMissing('missing', [], false, 'unavailable')).toBe(false);
  });
});
