import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { NexusResourceService } from './resource';

vi.mock('@/services/nexus/nexus.utils', () => ({
  queryNexus: vi.fn(),
  buildNexusUrl: (endpoint: string) => `https://nexus.staging.pubky.app/${endpoint}`,
  buildUrlWithQuery: ({ baseRoute, params }: { baseRoute: string; params: Record<string, unknown> }) =>
    `https://nexus.staging.pubky.app/${baseRoute}?${new URLSearchParams(params as Record<string, string>).toString()}`,
  encodePathSegment: encodeURIComponent,
}));

describe('NexusResourceService', () => {
  beforeEach(() => {
    vi.mocked(queryNexus).mockReset();
  });

  it('fetches tag-filtered resources from the stream endpoint', async () => {
    const resource = {
      details: { id: '1', uri: 'https://example.com', scheme: 'https', indexed_at: 1 },
      tags: [],
      taggers_count: 0,
    };
    vi.mocked(queryNexus).mockResolvedValueOnce([resource]);

    await expect(NexusResourceService.fetchByTag({ tag: 'docs', limit: 20 })).resolves.toEqual([resource]);
    expect(queryNexus).toHaveBeenCalledOnce();
  });

  it('fetches resource details and tags by id', async () => {
    const response = { resource: { id: '1', uri: 'https://example.com', scheme: 'https', indexed_at: 1 }, tags: [] };
    vi.mocked(queryNexus).mockResolvedValueOnce(response);

    await expect(NexusResourceService.fetchById({ id: '1' })).resolves.toEqual(response);
    expect(queryNexus).toHaveBeenCalledWith(expect.objectContaining({ retry: false }));
  });

  it('looks up a resource by its raw URI without hashing it', async () => {
    vi.mocked(queryNexus).mockResolvedValueOnce({ resource: { id: '1' }, tags: [] });

    await NexusResourceService.fetchByUri({ uri: 'https://Example.com/path' });

    expect(queryNexus).toHaveBeenCalledWith(expect.objectContaining({ retry: false }));
  });

  it('fetches the cursor page through the ids endpoint and detail reads', async () => {
    vi.mocked(queryNexus)
      .mockResolvedValueOnce({ resource_ids: ['1'], last_score: 42 })
      .mockResolvedValueOnce({
        resource: { id: '1', uri: 'https://example.com', scheme: 'https', indexed_at: 1 },
        tags: [],
      });

    await expect(NexusResourceService.fetchStreamPage({ app: 'jeb.pubky.app', limit: 20 })).resolves.toEqual({
      resources: [
        {
          details: { id: '1', uri: 'https://example.com', scheme: 'https', indexed_at: 1 },
          tags: [],
          taggers_count: 0,
        },
      ],
      lastScore: 42,
    });
  });
});
