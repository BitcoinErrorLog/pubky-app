import { describe, expect, it, vi } from 'vitest';
import { PubchiProfile } from '@/templates/Pubchi/PubchiProfile/PubchiProfile';
import { renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

const BOT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => ({
    pubchi: {
      bot: BOT,
      displayName: 'Research Pubchi',
      createdAt: 1_768_454_400,
      backupConfirmedAt: 1_768_454_400,
      verified: true,
    },
    config: {
      tier: 'assisted',
      brain: {
        execution: 'synonym-hosted',
        provider_id: 'moonshot',
        model_id: 'kimi-k3',
        endpoint: null,
        adapter: 'vercel-ai',
        send_public_graph_context: true,
        send_public_web_context: true,
      },
    },
    devices: [],
    needsReapproval: false,
  }),
}));

describe('PubchiProfile — visual regression', () => {
  it('guards the production page surface marker', async () => {
    const screen = await renderForVRT(<PubchiProfile />, { viewport: VRT_VIEWPORT_DESKTOP });
    const surface = screen.getByTestId('pubchi-profile-page');
    await expect.element(surface).toHaveAttribute('data-surface', 'pubchi-profile-page');
  });

  it('captures the production Pubchi page surface only', async () => {
    const screen = await renderForVRT(<PubchiProfile />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId('pubchi-profile-page')).toMatchScreenshot('pubchi-profile-page-desktop');
  });
});
