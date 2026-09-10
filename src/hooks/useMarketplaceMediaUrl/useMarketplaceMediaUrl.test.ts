import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceMediaService } from '@/core/services/commerce/marketplace-media';
import { clearMarketplaceMediaCache, resolveMarketplaceMediaUrlAsync } from './useMarketplaceMediaUrl';

vi.mock('@/core/services/commerce/marketplace-media', () => ({
  MarketplaceMediaService: {
    getOwnerHomeserver: vi.fn(),
    getConfiguredHomeserver: vi.fn(() => 'configured-homeserver'),
    getConfiguredHomeserverUrl: vi.fn(() => 'https://configured.example'),
    fetchMedia: vi.fn(),
  },
}));

const owner = 'y'.repeat(52);
const otherOwner = 'b'.repeat(52);
const mediaUri = `pubky://${owner}/pub/pubky.app/marketplace/v1/media/image`;
const otherMediaUri = `pubky://${otherOwner}/pub/pubky.app/marketplace/v1/media/image`;

describe('marketplace media resolution', () => {
  beforeEach(() => {
    clearMarketplaceMediaCache();
    vi.clearAllMocks();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:marketplace-media'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('uses the direct URL for an owner on the configured homeserver', async () => {
    vi.mocked(MarketplaceMediaService.getOwnerHomeserver).mockResolvedValue('configured-homeserver');

    await expect(resolveMarketplaceMediaUrlAsync(mediaUri)).resolves.toContain(`pubky-host=${owner}`);
    expect(MarketplaceMediaService.fetchMedia).not.toHaveBeenCalled();
  });

  it('fetches another owner through the SDK and returns an object URL', async () => {
    vi.mocked(MarketplaceMediaService.getOwnerHomeserver).mockResolvedValue('other-homeserver');
    vi.mocked(MarketplaceMediaService.fetchMedia).mockResolvedValue(new Blob(['media']));

    await expect(resolveMarketplaceMediaUrlAsync(otherMediaUri)).resolves.toBe('blob:marketplace-media');
    expect(MarketplaceMediaService.fetchMedia).toHaveBeenCalledTimes(1);
  });

  it('returns null when the owner has no homeserver record', async () => {
    vi.mocked(MarketplaceMediaService.getOwnerHomeserver).mockResolvedValue(null);

    await expect(resolveMarketplaceMediaUrlAsync(otherMediaUri)).resolves.toBeNull();
  });

  it('deduplicates concurrent SDK requests', async () => {
    vi.mocked(MarketplaceMediaService.getOwnerHomeserver).mockResolvedValue('other-homeserver');
    vi.mocked(MarketplaceMediaService.fetchMedia).mockResolvedValue(new Blob(['media']));

    await Promise.all([resolveMarketplaceMediaUrlAsync(otherMediaUri), resolveMarketplaceMediaUrlAsync(otherMediaUri)]);
    expect(MarketplaceMediaService.getOwnerHomeserver).toHaveBeenCalledTimes(1);
    expect(MarketplaceMediaService.fetchMedia).toHaveBeenCalledTimes(1);
  });

  it('expires cached owner media after the TTL', async () => {
    vi.useFakeTimers();
    vi.mocked(MarketplaceMediaService.getOwnerHomeserver).mockResolvedValue('other-homeserver');
    vi.mocked(MarketplaceMediaService.fetchMedia).mockResolvedValue(new Blob(['media']));

    await resolveMarketplaceMediaUrlAsync(otherMediaUri);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await resolveMarketplaceMediaUrlAsync(otherMediaUri);

    expect(MarketplaceMediaService.fetchMedia).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:marketplace-media');
    vi.useRealTimers();
  });
});
