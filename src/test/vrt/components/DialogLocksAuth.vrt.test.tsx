// Preserve browser mock initialization order.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';
import { DialogLocksAuth } from '@/organisms/DialogLocksAuth/DialogLocksAuth';

// Connecting keeps the Lock Server's cross-origin /connect page out of the capture.
vi.mock('@/hooks/useLocksAuthFlow/useLocksAuthFlow', () => ({
  useLocksAuthFlow: () => ({
    status: 'connecting',
    connectUrl: null,
    session: null,
    error: null,
    iframeRef: { current: null },
    prepare: vi.fn(),
    start: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePaykitSetupFlow/usePaykitSetupFlow', () => ({
  usePaykitSetupFlow: () => ({
    status: 'idle',
    setupUrl: null,
    error: null,
    iframeRef: { current: null },
    check: vi.fn(),
    start: vi.fn(),
    reset: vi.fn(),
  }),
}));

// Desktop only: the harness cannot emulate a coarse pointer, which swaps the logos for the shell's app buttons.
describe('DialogLocksAuth desktop', () => {
  it('renders the Enable Locks step with the signer logos', async () => {
    await renderForVRT(<DialogLocksAuth open onOpenChange={vi.fn()} onSuccess={vi.fn()} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect.element(page.getByRole('dialog')).toBeVisible();
    await expect.element(page.getByRole('img', { name: 'Bitkit' })).toBeVisible();
    await matchVrtFrameScreenshot('locks-auth-enable-desktop');
  });
});
