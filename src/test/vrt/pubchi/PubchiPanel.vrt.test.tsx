import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import { PUBCHI_PANEL_SURFACE, PubchiPanel } from '@/organisms/Pubchi/PubchiPanel/PubchiPanel';
import { renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

const mockQuery = vi.hoisted(() => ({
  signingAvailable: true,
  loading: false,
  elapsedMs: 0,
  answer: false,
}));

const ANSWER: PubchiQuerySuccess = {
  kind: 'answer',
  result: {
    schema: 'pubchi-answer',
    version: 1,
    bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
    owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
    generated_at: 1,
    run_id: 'vrt-answer',
    purpose: 'ask',
    question: 'Who is active?',
    summary: 'The graph shows Alice is active.',
    evidence: [],
    sources: [],
    tool_trace_summary: { tools: ['top_posts'], call_count: 1, truncated: false },
    policy_version: 1,
  },
};

vi.mock('@/hooks/usePubchiQuery/usePubchiQuery', () => ({
  usePubchiQuery: () => ({
    form: {
      control: {},
      getValues: () => ({ question: '' }),
      watch: () => '',
      trigger: async () => true,
    },
    submit: vi.fn(),
    applyFeed: vi.fn(),
    result: mockQuery.answer ? ANSWER : undefined,
    errorCode: undefined,
    loading: mockQuery.loading,
    elapsedMs: mockQuery.elapsedMs,
    enabled: true,
    pubchiAvailable: true,
    signingAvailable: mockQuery.signingAvailable,
    signingUnavailableMessage: "This browser isn't set up for Pubchi yet. Set it up to start asking.",
    setupDevice: vi.fn(),
    setupLoading: false,
  }),
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiPanelEnabled: () => true,
  isPubchiEnabled: () => true,
}));

const enrollment = {
  needsReapproval: false,
  reapprove: vi.fn(),
  loading: false,
  pubchi: undefined as
    | {
        bot: string;
        displayName: string;
        verified: boolean;
        backupConfirmedAt?: number | null;
      }
    | undefined,
  config: undefined as
    | {
        tier: 'read-only' | 'assisted' | 'autonomous';
        brain: { execution: 'synonym-hosted' | 'self-hosted' };
      }
    | undefined,
};

vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => enrollment,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' }),
}));

vi.mock('@/molecules/ControlledTextareaField/ControlledTextareaField', () => ({
  ControlledTextareaField: () => <textarea aria-label="Question" defaultValue="" />,
}));

describe('PubchiPanel — visual regression', () => {
  beforeEach(() => {
    mockQuery.signingAvailable = true;
    mockQuery.loading = false;
    mockQuery.elapsedMs = 0;
    mockQuery.answer = false;
    enrollment.pubchi = undefined;
    enrollment.config = undefined;
  });

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

  it('captures the enrolled bot header and compact capabilities', async () => {
    enrollment.pubchi = {
      bot: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      displayName: 'Research Pubchi',
      verified: true,
      backupConfirmedAt: 1,
    };
    enrollment.config = {
      tier: 'assisted',
      brain: { execution: 'synonym-hosted' },
    };
    const screen = await renderForVRT(<PubchiPanel open onOpenChange={() => {}} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId('pubchi-flyout-header')).toBeVisible();
    await expect(screen.getByTestId('pubchi-capabilities-compact')).toBeVisible();
    await expect(screen.getByTestId(PUBCHI_PANEL_SURFACE)).toMatchScreenshot('pubchi-panel-enrolled-desktop');
  });

  it('captures the no-bot create CTA', async () => {
    const screen = await renderForVRT(<PubchiPanel open onOpenChange={() => {}} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId('pubchi-create-header')).toBeVisible();
    await expect(screen.getByTestId(PUBCHI_PANEL_SURFACE)).toMatchScreenshot('pubchi-panel-no-bot-desktop');
  });

  it('captures the answer surface only', async () => {
    mockQuery.answer = true;
    const screen = await renderForVRT(<PubchiPanel open onOpenChange={() => {}} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId('pubchi-answer')).toMatchScreenshot('pubchi-answer-desktop');
  });

  it('captures the answer loading surface only', async () => {
    mockQuery.loading = true;
    mockQuery.elapsedMs = 2450;
    const screen = await renderForVRT(<PubchiPanel open onOpenChange={() => {}} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId('pubchi-answer-loading')).toMatchScreenshot('pubchi-answer-loading-desktop');
  });

  it('captures the unenrolled signing copy', async () => {
    mockQuery.signingAvailable = false;
    const screen = await renderForVRT(<PubchiPanel open onOpenChange={() => {}} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(PUBCHI_PANEL_SURFACE)).toMatchScreenshot('pubchi-panel-unenrolled-desktop');
  });
});
