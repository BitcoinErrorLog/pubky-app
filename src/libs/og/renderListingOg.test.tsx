import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommerceListingFixture } from '@/test/fixtures/commerce/commerce';
import { renderListingOg } from './renderListingOg';

const { fetchListingMock, fetchOgMediaMock, renderMarketplaceMock } = vi.hoisted(() => ({
  fetchListingMock: vi.fn(),
  fetchOgMediaMock: vi.fn(),
  renderMarketplaceMock: vi.fn((headers?: Record<string, string>) =>
    Promise.resolve(
      new Response('fallback', { status: 200, headers: headers ?? { 'cache-control': 'public, max-age=300' } }),
    ),
  ),
}));

vi.mock('./ogCommerceData', () => ({
  fetchListingForMetadata: fetchListingMock,
  fetchOgMediaAsDataUri: fetchOgMediaMock,
  OG_COMMERCE_CACHE_HEADERS: { 'cache-control': 'public, max-age=300' },
  OG_NO_STORE_CACHE_HEADERS: { 'cache-control': 'no-store' },
}));

vi.mock('./renderMarketplaceOg', () => ({
  renderMarketplaceOg: renderMarketplaceMock,
}));

const params = {
  sellerPubky: '8mmmaouyode95qf7scbt4moytceiga4we5i3fwra71xapmwguwdy',
  listingId: 'aa540efdabb144c0babc304c5d19f1d3',
};

describe('renderListingOg fallback caching', () => {
  beforeEach(() => {
    fetchListingMock.mockReset();
    fetchOgMediaMock.mockReset();
    renderMarketplaceMock.mockClear();
  });

  it('returns a 200 no-store fallback when metadata is unavailable', async () => {
    fetchListingMock.mockResolvedValue({ kind: 'unavailable', reason: 'timeout' });

    const response = await renderListingOg(params);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns a cacheable fallback for a genuine not-found result', async () => {
    fetchListingMock.mockResolvedValue({ kind: 'not_found' });

    const response = await renderListingOg(params);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('fetches the first listing image through the seller-hosted media helper', async () => {
    const record = createCommerceListingFixture({ ownerPubky: params.sellerPubky });
    fetchListingMock.mockResolvedValue({ kind: 'found', record });
    fetchOgMediaMock.mockResolvedValue('data:image/png;base64,AAAA');

    const response = await renderListingOg({ sellerPubky: params.sellerPubky, listingId: record.listingId });

    expect(response.status).toBe(200);
    expect(fetchOgMediaMock).toHaveBeenCalledWith(record.media[0].url);
  });

  it('does not fetch listing media for adult-only listings', async () => {
    const record = createCommerceListingFixture({ ownerPubky: params.sellerPubky, adultOnly: true });
    fetchListingMock.mockResolvedValue({ kind: 'found', record });

    const response = await renderListingOg({ sellerPubky: params.sellerPubky, listingId: record.listingId });

    expect(response.status).toBe(200);
    expect(fetchOgMediaMock).not.toHaveBeenCalled();
  });
});
