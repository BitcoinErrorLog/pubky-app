import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderListingOg } from './renderListingOg';

const { fetchListingMock, renderMarketplaceMock } = vi.hoisted(() => ({
  fetchListingMock: vi.fn(),
  renderMarketplaceMock: vi.fn((headers?: Record<string, string>) =>
    Promise.resolve(
      new Response('fallback', { status: 200, headers: headers ?? { 'cache-control': 'public, max-age=300' } }),
    ),
  ),
}));

vi.mock('./ogCommerceData', () => ({
  fetchListingForMetadata: fetchListingMock,
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
});
