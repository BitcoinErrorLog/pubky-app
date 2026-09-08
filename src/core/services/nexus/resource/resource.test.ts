import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NexusResourceService } from './resource';

vi.mock('@/services/nexus/nexus.utils', () => ({
  createFetchOptions: vi.fn(() => ({ method: 'GET', headers: {} })),
  buildNexusUrl: (endpoint: string) => `https://nexus.staging.pubky.app/${endpoint}`,
  buildUrlWithQuery: ({ baseRoute, params }: { baseRoute: string; params: Record<string, unknown> }) =>
    `https://nexus.staging.pubky.app/${baseRoute}?${new URLSearchParams(params as Record<string, string>).toString()}`,
  encodePathSegment: encodeURIComponent,
}));

describe('NexusResourceService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches tag-filtered resources from the stream endpoint', async () => {
    const resource = {
      details: { id: '1', uri: 'https://example.com', scheme: 'https', indexed_at: 1 },
      tags: [],
      taggers_count: 0,
    };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify([resource]), { status: 200 }));

    await expect(NexusResourceService.fetchByTag({ tag: 'docs', limit: 20 })).resolves.toEqual([resource]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fetches resource details and tags by id', async () => {
    const response = { resource: { id: '1', uri: 'https://example.com', scheme: 'https', indexed_at: 1 }, tags: [] };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }));

    await expect(NexusResourceService.fetchById({ id: '1' })).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('limit_tags=20');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('skip_tags=0');
  });

  it('looks up a resource by its raw URI without hashing it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ resource: { id: '1' }, tags: [] }), { status: 200 }),
    );

    await NexusResourceService.fetchByUri({ uri: 'https://Example.com/path' });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('limit_tags=20');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('skip_tags=0');
  });

  it('fails once without retrying when Nexus is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(NexusResourceService.fetchByTag({ tag: 'docs', limit: 20 })).rejects.toThrow('fetch failed');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
