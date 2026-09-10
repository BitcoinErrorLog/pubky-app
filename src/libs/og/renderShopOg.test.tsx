import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderShopOg } from './renderShopOg';

const { fetchShopMock, renderMarketplaceMock } = vi.hoisted(() => ({
  fetchShopMock: vi.fn(),
  renderMarketplaceMock: vi.fn((headers?: Record<string, string>) =>
    Promise.resolve(
      new Response('fallback', { status: 200, headers: headers ?? { 'cache-control': 'public, max-age=300' } }),
    ),
  ),
}));

vi.mock('./ogCommerceData', () => ({
  fetchShopForMetadata: fetchShopMock,
  OG_COMMERCE_CACHE_HEADERS: { 'cache-control': 'public, max-age=300' },
  OG_NO_STORE_CACHE_HEADERS: { 'cache-control': 'no-store' },
}));

vi.mock('./renderMarketplaceOg', () => ({
  renderMarketplaceOg: renderMarketplaceMock,
}));

describe('renderShopOg fallback caching', () => {
  beforeEach(() => {
    fetchShopMock.mockReset();
    renderMarketplaceMock.mockClear();
  });

  it('returns a 200 no-store fallback when shop metadata is unavailable', async () => {
    fetchShopMock.mockResolvedValue({ kind: 'unavailable', reason: 'timeout' });

    const response = await renderShopOg({
      sellerPubky: '8mmmaouyode95qf7scbt4moytceiga4we5i3fwra71xapmwguwdy',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
