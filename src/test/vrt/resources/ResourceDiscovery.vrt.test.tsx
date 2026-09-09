/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import streamFixture from '@/test/fixtures/resources/stream.json';
import detailFixture from '@/test/fixtures/resources/bitcoin-org.json';
import ogMetadataFixture from '@/test/fixtures/resources/og-metadata.json';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { ResourceDiscovery } from '@/organisms/ResourceDiscovery/ResourceDiscovery';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';

vi.mock('next/navigation', () => {
  const router = { push: vi.fn(), replace: vi.fn() };
  return {
    useRouter: () => router,
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock('@/controllers/resource/resource', () => ({
  ResourceController: {
    fetchStreamPage: vi.fn(async () => ({ resources: streamFixture.slice(0, 4), nextSkip: null })),
    fetchById: vi.fn(async () => detailFixture),
    fetchByUri: vi.fn(async () => detailFixture),
    fetchByTag: vi.fn(async () => streamFixture.slice(0, 2)),
  },
}));

vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: (url: string) => ({
    metadata: {
      url,
      ...(ogMetadataFixture[url as keyof typeof ogMetadataFixture] ?? { title: null, description: null, image: null }),
      type: 'website',
    },
    isLoading: false,
    error: null,
  }),
}));

describe('ResourceDiscovery — visual regression', () => {
  it('renders the index production surface on desktop', async () => {
    await renderForVRT(<ResourceDiscovery />, { viewport: VRT_VIEWPORT_DESKTOP });
    expect(document.querySelector('[data-surface="resource-discovery"]')).toBeTruthy();
    await matchVrtFrameScreenshot('resource-discovery-index-desktop');
  });

  it('renders the detail production surface on mobile', async () => {
    await renderForVRT(<ResourceDiscovery id="1c6c009898fb15a2021b1d1d45fbe85a" />, { viewport: VRT_VIEWPORT_MOBILE });
    expect(document.querySelector('[data-surface="resource-card"]')).toBeTruthy();
    await matchVrtFrameScreenshot('resource-discovery-detail-mobile');
  });

  it('renders the explicit metadata fallback scene', async () => {
    const fallback = {
      ...streamFixture[0],
      details: { ...streamFixture[0].details, uri: 'https://unknown.example/path' },
    };
    await renderForVRT(<ResourceCard resource={fallback} />, { viewport: VRT_VIEWPORT_DESKTOP });
    expect(document.querySelector('[data-surface="resource-card"]')).toBeTruthy();
    await matchVrtFrameScreenshot('resource-card-metadata-fallback');
  });
});
