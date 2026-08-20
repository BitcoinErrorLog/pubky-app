// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplaceModeration } from '@/templates/Marketplace/MarketplaceModeration';

// Covers every report reason defined by the report schema union (the fixture
// sweep also cycles through every target type), split so each reason is
// visible, plus the empty queue and the non-moderator error view — and the
// dispute adjudication queue states: populated (open + resolved disputes),
// empty-for-a-moderator, absent-for-a-non-moderator, and the sandbox
// degradation notice.
const fixtures = vi.hoisted(async () => {
  const { createReportsForEveryReason } = await import('@/test/fixtures/commerce/reports');
  const { createOrderFixture } = await import('@/test/fixtures/commerce/orders');
  const everyReason = createReportsForEveryReason();
  const openDispute = createOrderFixture('disputed', {
    dispute: {
      state: 'open',
      openedBy: 'b'.repeat(52),
      reason: 'Seller stopped responding after delivery exception',
      requestedRemedy: 'refund',
      resolution: null,
      rationale: null,
      evidenceCount: 2,
      openedAt: '2026-08-19T12:00:00.000Z',
      resolvedAt: null,
    },
  });
  const resolvedDispute = createOrderFixture('completed', {
    id: '018f47d2-6a27-7c23-a49d-00000000d15b',
    dispute: {
      state: 'resolved',
      openedBy: 'b'.repeat(52),
      reason: 'Item arrived with split soles',
      requestedRemedy: 'partial_refund',
      resolution: 'seller_favor',
      rationale: 'Courier scans show the damage occurred after delivery.',
      evidenceCount: 3,
      openedAt: '2026-08-18T12:00:00.000Z',
      resolvedAt: '2026-08-19T16:00:00.000Z',
    },
  });
  return {
    reasonsFirstHalf: everyReason.slice(0, 3),
    reasonsSecondHalf: everyReason.slice(3),
    disputeQueue: [openDispute, resolvedDispute],
  };
});

const view = vi.hoisted(() => ({
  reports: [] as unknown[],
  isLoading: false,
  error: null as string | null,
}));

const disputesView = vi.hoisted(() => ({
  disputes: [] as unknown[],
  isModerator: null as boolean | null,
  isLoading: false,
  error: null as string | null,
  adapterMode: 'transaction-service' as string,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace/moderation',
}));

vi.mock('@/hooks/useMarketplaceModeration/useMarketplaceModeration', () => ({
  useMarketplaceModeration: () => ({
    reports: view.reports,
    isLoading: view.isLoading,
    error: view.error,
  }),
}));

vi.mock('@/hooks/useMarketplaceDisputes/useMarketplaceDisputes', () => ({
  useMarketplaceDisputes: () => ({
    disputes: disputesView.disputes,
    isModerator: disputesView.isModerator,
    isLoading: disputesView.isLoading,
    error: disputesView.error,
    adapterMode: disputesView.adapterMode,
    refresh: vi.fn(async () => {}),
  }),
}));

// The case dialog fetches on open; queue screenshots only need its trigger.
vi.mock('@/hooks/useMarketplaceDisputeCase/useMarketplaceDisputeCase', async () => {
  const { useForm } = await import('react-hook-form');
  const { marketplaceDisputeEvidenceFormDefaults, marketplaceDisputeResolveFormDefaults } =
    await import('@/hooks/useMarketplaceDisputeCase/useMarketplaceDisputeCase.types');
  return {
    useMarketplaceDisputeCase: () => ({
      order: null,
      caseFile: null,
      isLoading: false,
      error: null,
      refresh: vi.fn(async () => {}),
      evidenceForm: useForm({ defaultValues: marketplaceDisputeEvidenceFormDefaults }),
      resolveForm: useForm({ defaultValues: marketplaceDisputeResolveFormDefaults }),
      submitEvidence: vi.fn(async () => false),
      resolve: vi.fn(async () => false),
      isParticipant: false,
      isDisputeOpen: false,
      canSubmitEvidence: false,
    }),
  };
});

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main className="w-full py-6">{children}</main>,
}));

function resetDisputesView() {
  disputesView.disputes = [];
  disputesView.isModerator = null;
  disputesView.isLoading = false;
  disputesView.error = null;
  disputesView.adapterMode = 'transaction-service';
}

describe('Marketplace moderation queue — visual regression', () => {
  beforeEach(() => {
    view.reports = [];
    view.isLoading = false;
    view.error = null;
    // Report scenarios render with the dispute queue ABSENT (non-moderator
    // answer), which is exactly what a non-moderator must see: no dispute
    // affordance at all, not an empty-looking queue.
    resetDisputesView();
    disputesView.isModerator = false;
  });

  it('renders the first half of every report reason at desktop viewport', async () => {
    const { reasonsFirstHalf } = await fixtures;
    view.reports = reasonsFirstHalf;
    view.isLoading = false;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-reasons-1-desktop');
  });

  it('renders the first half of every report reason at mobile viewport', async () => {
    const { reasonsFirstHalf } = await fixtures;
    view.reports = reasonsFirstHalf;
    view.isLoading = false;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-reasons-1-mobile');
  });

  it('renders the second half of every report reason at desktop viewport', async () => {
    const { reasonsSecondHalf } = await fixtures;
    view.reports = reasonsSecondHalf;
    view.isLoading = false;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-reasons-2-desktop');
  });

  it('renders the empty queue at desktop viewport', async () => {
    view.reports = [];
    view.isLoading = false;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-empty-desktop');
  });

  it('renders the non-moderator view at desktop viewport', async () => {
    view.reports = [];
    view.isLoading = false;
    view.error = 'This account does not have marketplace moderator access.';

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-unauthorized-desktop');
  });

  it('renders the loading state at desktop viewport', async () => {
    view.reports = [];
    view.isLoading = true;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-loading-desktop');
  });

  it('renders the populated dispute queue for a moderator at desktop viewport', async () => {
    const { disputeQueue } = await fixtures;
    view.reports = [];
    disputesView.isModerator = true;
    disputesView.disputes = disputeQueue;

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-disputes-desktop');
  });

  it('renders the populated dispute queue for a moderator at mobile viewport', async () => {
    const { disputeQueue } = await fixtures;
    view.reports = [];
    disputesView.isModerator = true;
    disputesView.disputes = disputeQueue;

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-disputes-mobile');
  });

  it('renders the empty dispute queue for a moderator at desktop viewport', async () => {
    view.reports = [];
    disputesView.isModerator = true;
    disputesView.disputes = [];

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-disputes-empty-desktop');
  });

  it('keeps the dispute queue absent for a non-moderator at desktop viewport', async () => {
    view.reports = [];
    disputesView.isModerator = false;

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-disputes-absent-desktop');
  });

  it('renders the sandbox degradation notice instead of a fake dispute queue at desktop viewport', async () => {
    view.reports = [];
    disputesView.adapterMode = 'sandbox';

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-disputes-sandbox-desktop');
  });
});
