import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceController } from '@/controllers/resource/resource';
import { useResourceTagSearch } from './useResourceTagSearch';

vi.mock('@/controllers/resource/resource', () => ({
  ResourceController: {
    fetchByTag: vi.fn(),
  },
}));

function resource(id: string, taggersCount: number, indexedAt: number) {
  return {
    details: { id, uri: `https://${id}.example`, scheme: 'https', indexed_at: indexedAt },
    tags: [],
    taggers_count: taggersCount,
  };
}

describe('useResourceTagSearch', () => {
  beforeEach(() => {
    vi.mocked(ResourceController.fetchByTag).mockReset();
  });

  it('makes one request for one label', async () => {
    vi.mocked(ResourceController.fetchByTag).mockResolvedValueOnce([resource('one', 1, 1)]);

    const { result } = renderHook(() => useResourceTagSearch(['bitcoin']));

    await waitFor(() => expect(result.current.resources).toHaveLength(1));
    expect(ResourceController.fetchByTag).toHaveBeenCalledTimes(1);
    expect(ResourceController.fetchByTag).toHaveBeenCalledWith(expect.objectContaining({ tag: 'bitcoin' }));
  });

  it('makes one single-tag request per label in parallel', async () => {
    vi.mocked(ResourceController.fetchByTag)
      .mockResolvedValueOnce([resource('one', 1, 1)])
      .mockResolvedValueOnce([resource('two', 1, 2)])
      .mockResolvedValueOnce([resource('three', 1, 3)]);

    const { result } = renderHook(() => useResourceTagSearch(['one', 'two', 'three']));

    await waitFor(() => expect(result.current.resources).toHaveLength(3));
    expect(ResourceController.fetchByTag).toHaveBeenCalledTimes(3);
    expect(vi.mocked(ResourceController.fetchByTag).mock.calls.every(([params]) => !params.tag.includes(','))).toBe(
      true,
    );
  });

  it('caps fan-out at five labels', async () => {
    vi.mocked(ResourceController.fetchByTag).mockResolvedValue([]);

    renderHook(() => useResourceTagSearch(['one', 'two', 'three', 'four', 'five', 'six', 'seven']));

    await waitFor(() => expect(ResourceController.fetchByTag).toHaveBeenCalledTimes(5));
  });

  it('deduplicates resources and orders by tagger count then indexed time', async () => {
    vi.mocked(ResourceController.fetchByTag)
      .mockResolvedValueOnce([resource('duplicate', 3, 10), resource('old', 5, 1)])
      .mockResolvedValueOnce([resource('duplicate', 3, 20), resource('new', 5, 2)]);

    const { result } = renderHook(() => useResourceTagSearch(['first', 'second']));

    await waitFor(() => expect(result.current.resources).toHaveLength(3));
    expect(result.current.resources.map(({ details }) => details.id)).toEqual(['new', 'old', 'duplicate']);
  });
});
