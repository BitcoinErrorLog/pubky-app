import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceMediaService } from './marketplace-media';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('@synonymdev/pubky', () => ({
  Client: class {
    fetch = fetchMock;
  },
  PublicKey: {
    from: vi.fn(),
  },
  Pubky: {
    withClient: vi.fn(() => ({
      getHomeserverOf: vi.fn(),
    })),
  },
  resolvePubky: vi.fn((uri: string) => `https://resolved.example/${uri}`),
}));

vi.mock('@/config/network', () => ({
  getHomeserver: () => 'configured-homeserver',
  getHomeserverUrl: () => 'https://configured.example',
  getPkarrRelays: () => [],
}));

describe('MarketplaceMediaService', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response('media', { status: 200 }));
  });

  it('fetches public media without credentials', async () => {
    await MarketplaceMediaService.fetchMedia('pubky://owner/pub/media');

    expect(fetchMock).toHaveBeenCalledWith('https://resolved.example/pubky://owner/pub/media');
  });
});
