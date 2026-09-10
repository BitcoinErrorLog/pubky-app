import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalResourceService } from '@/services/local/resource/resource';
import { NexusResourceService } from '@/services/nexus/resource/resource';
import { ResourceApplication } from './resource';

vi.mock('@/services/local/resource/resource', () => ({
  LocalResourceService: {
    getCachedLookup: vi.fn(),
    saveLookup: vi.fn(),
  },
  RESOURCE_LOOKUP_CACHE_TTL_MS: 300_000,
}));

vi.mock('@/services/nexus/resource/resource', () => ({
  NexusResourceService: {
    fetchByUri: vi.fn(),
  },
}));

describe('ResourceApplication.getOrFetchByUri', () => {
  beforeEach(() => {
    vi.mocked(LocalResourceService.getCachedLookup).mockReset();
    vi.mocked(LocalResourceService.saveLookup).mockReset();
    vi.mocked(NexusResourceService.fetchByUri).mockReset();
  });

  it('returns a cached hit without calling Nexus', async () => {
    const response = {
      resource: { id: '1', uri: 'https://example.com', scheme: 'https', indexed_at: 1 },
      tags: [],
    };
    vi.mocked(LocalResourceService.getCachedLookup).mockResolvedValue(response);

    await expect(ResourceApplication.getOrFetchByUri('HTTPS://Example.COM:443/x#top')).resolves.toEqual(response);
    expect(NexusResourceService.fetchByUri).not.toHaveBeenCalled();
  });

  it('fetches and saves a cache miss', async () => {
    const response = {
      resource: { id: '1', uri: 'https://example.com', scheme: 'https', indexed_at: 1 },
      tags: [],
    };
    vi.mocked(LocalResourceService.getCachedLookup).mockResolvedValue(undefined);
    vi.mocked(NexusResourceService.fetchByUri).mockResolvedValue(response);

    await expect(ResourceApplication.getOrFetchByUri('https://example.com/x')).resolves.toEqual(response);
    expect(NexusResourceService.fetchByUri).toHaveBeenCalledWith({ uri: 'https://example.com/x' });
    expect(LocalResourceService.saveLookup).toHaveBeenCalledWith('https://example.com/x', response, expect.any(Number));
  });

  it('returns a cached negative lookup without calling Nexus', async () => {
    vi.mocked(LocalResourceService.getCachedLookup).mockResolvedValue(null);

    await expect(ResourceApplication.getOrFetchByUri('https://example.com/untagged')).resolves.toBeNull();
    expect(NexusResourceService.fetchByUri).not.toHaveBeenCalled();
  });
});
