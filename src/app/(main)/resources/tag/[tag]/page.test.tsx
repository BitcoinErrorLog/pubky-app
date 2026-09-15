import { describe, expect, it, vi } from 'vitest';
import ResourceTagPage from './page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/templates/ResourceDiscovery/ResourceDiscoveryPage', () => ({
  ResourceDiscoveryPage: ({ tag }: { tag?: string }) => <div>Resources tagged {tag}</div>,
}));

describe('ResourceTagPage', () => {
  it('decodes a valid tag and renders the public resource stream page', async () => {
    const page = await ResourceTagPage({ params: Promise.resolve({ tag: 'privacy-guides' }) });

    expect(page).toHaveProperty('props.tag', 'privacy-guides');
  });

  it('returns not found for an invalid tag', async () => {
    await expect(ResourceTagPage({ params: Promise.resolve({ tag: 'bad%3Atag' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
