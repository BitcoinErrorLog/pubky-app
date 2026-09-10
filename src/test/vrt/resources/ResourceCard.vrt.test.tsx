import { describe, expect, it, vi } from 'vitest';
import fixture from '@/test/fixtures/resources/stream.json';
import { ResourceCard } from '@/organisms/ResourceCard/ResourceCard';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({
    metadata: { title: 'Bitcoin.org', description: 'Bitcoin resources', image: null },
  }),
}));

describe('ResourceCard — visual regression', () => {
  it('renders the production web resource surface', async () => {
    await renderForVRT(<ResourceCard resource={fixture[0]} variant="feed" />, { viewport: VRT_VIEWPORT_DESKTOP });
    expect(document.querySelector('[data-surface="resource-card"]')).toBeTruthy();
    await matchVrtFrameScreenshot('resource-card-web');
  });

  it('renders a generic fallback production surface', async () => {
    const resource = {
      ...fixture[0],
      details: { ...fixture[0].details, uri: 'https://unknown.example/path', scheme: 'https' },
    };
    await renderForVRT(<ResourceCard resource={resource} variant="detail" />, { viewport: VRT_VIEWPORT_DESKTOP });
    expect(document.querySelector('[data-surface="resource-card"]')).toBeTruthy();
    await matchVrtFrameScreenshot('resource-card-generic');
  });
});
