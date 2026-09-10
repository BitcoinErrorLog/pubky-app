import { describe, expect, it, vi } from 'vitest';
import { ResourceDiscovery } from '@/organisms/ResourceDiscovery/ResourceDiscovery';
import ogMetadataFixture from '@/test/fixtures/resources/og-metadata.json';
import streamFixture from '@/test/fixtures/resources/stream.json';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/controllers/resource/resource', () => ({
  ResourceController: {
    fetchStreamPage: vi.fn(async () => ({ resources: streamFixture.slice(0, 3), nextSkip: null })),
    fetchByTag: vi.fn(async () => []),
  },
}));

vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: (url: string) => ({
    metadata: {
      ...(ogMetadataFixture[url as keyof typeof ogMetadataFixture] ?? { title: null, description: null, image: null }),
    },
  }),
}));

describe('Resource index — visual regression', () => {
  it('renders the production browse surface', async () => {
    await renderForVRT(<ResourceDiscovery />, { viewport: VRT_VIEWPORT_DESKTOP });
    expect(document.querySelector('[data-surface="resource-discovery"]')).toBeTruthy();
    expect(document.querySelector('[data-surface="resource-card"]')).toBeTruthy();
    const cardTitles = Array.from(document.querySelectorAll('[data-surface="resource-card"] h2')).map(
      (title) => title.textContent,
    );
    expect(cardTitles).toEqual(
      streamFixture
        .slice(0, 3)
        .map((resource) => ogMetadataFixture[resource.details.uri as keyof typeof ogMetadataFixture].title),
    );
    await matchVrtFrameScreenshot('resource-index');
  });
});
