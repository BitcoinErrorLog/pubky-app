import { describe, expect, it, vi } from 'vitest';
import { PUBCHI_PANEL_SURFACE, PubchiPanel } from '@/organisms/Pubchi/PubchiPanel/PubchiPanel';
import { renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

const mockQuery = vi.hoisted(() => ({
  signingAvailable: true,
}));

vi.mock('@/hooks/usePubchiQuery/usePubchiQuery', () => ({
  usePubchiQuery: () => ({
    form: {
      control: {},
      getValues: () => ({ question: '' }),
      trigger: async () => true,
    },
    submit: vi.fn(),
    applyFeed: vi.fn(),
    result: undefined,
    errorCode: undefined,
    loading: false,
    enabled: true,
    signingAvailable: mockQuery.signingAvailable,
    signingUnavailableMessage: 'This browser is not enrolled. Enroll a bot in Settings → Pubchi.',
  }),
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiPanelEnabled: () => true,
  isPubchiEnabled: () => true,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' }),
}));

vi.mock('@/molecules/ControlledTextareaField/ControlledTextareaField', () => ({
  ControlledTextareaField: () => <textarea aria-label="Question" defaultValue="" />,
}));

describe('PubchiPanel — visual regression', () => {
  it('guards the production surface marker', async () => {
    mockQuery.signingAvailable = true;
    const screen = await renderForVRT(<PubchiPanel open onOpenChange={() => {}} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    const surface = screen.getByTestId(PUBCHI_PANEL_SURFACE);
    await expect.element(surface).toHaveAttribute('data-surface', PUBCHI_PANEL_SURFACE);
  });

  it('captures the production panel surface only', async () => {
    mockQuery.signingAvailable = true;
    const screen = await renderForVRT(<PubchiPanel open onOpenChange={() => {}} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(PUBCHI_PANEL_SURFACE)).toMatchScreenshot('pubchi-panel-desktop');
  });

  it('captures the unenrolled signing copy', async () => {
    mockQuery.signingAvailable = false;
    const screen = await renderForVRT(<PubchiPanel open onOpenChange={() => {}} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(PUBCHI_PANEL_SURFACE)).toMatchScreenshot('pubchi-panel-unenrolled-desktop');
  });
});
