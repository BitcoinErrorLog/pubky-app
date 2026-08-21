// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplaceDisputeCaseDialog } from '@/organisms/Marketplace/MarketplaceDisputeCaseDialog';

// The case file view in its schema-driven states: populated with evidence
// from both participants, empty (dispute open but nothing submitted), the
// inaccessible-order error, and the moderator resolve panel with its remedy
// options and audit disclosure.
const fixtures = vi.hoisted(async () => {
  const { createOrderFixture } = await import('@/test/fixtures/commerce/orders');
  const { createCaseFileFixture, createEvidenceFixtures } = await import('@/test/fixtures/commerce/evidence');
  const disputedOrder = createOrderFixture('disputed', {
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
  return {
    disputedOrder,
    caseFile: createCaseFileFixture(disputedOrder.id, createEvidenceFixtures()),
    emptyCaseFile: createCaseFileFixture(disputedOrder.id, []),
  };
});

const view = vi.hoisted(() => ({
  order: null as unknown,
  caseFile: null as unknown,
  isLoading: false,
  error: null as string | null,
  isParticipant: false,
  isDisputeOpen: false,
  canSubmitEvidence: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace/orders',
}));

vi.mock('@/hooks/useMarketplaceDisputeCase/useMarketplaceDisputeCase', async () => {
  const { useForm } = await import('react-hook-form');
  const { marketplaceDisputeEvidenceFormDefaults, marketplaceDisputeResolveFormDefaults } =
    await import('@/hooks/useMarketplaceDisputeCase/useMarketplaceDisputeCase.types');
  return {
    useMarketplaceDisputeCase: () => ({
      order: view.order,
      caseFile: view.caseFile,
      isLoading: view.isLoading,
      error: view.error,
      needsSession: false,
      refresh: vi.fn(async () => {}),
      evidenceForm: useForm({ defaultValues: marketplaceDisputeEvidenceFormDefaults }),
      resolveForm: useForm({ defaultValues: marketplaceDisputeResolveFormDefaults }),
      submitEvidence: vi.fn(async () => false),
      resolve: vi.fn(async () => false),
      isParticipant: view.isParticipant,
      isDisputeOpen: view.isDisputeOpen,
      canSubmitEvidence: view.canSubmitEvidence,
    }),
  };
});

async function openDialog(trigger: { click: () => Promise<void> }) {
  await trigger.click();
  await vi.waitFor(() => {
    if (!document.querySelector('[role="dialog"]')) throw new Error('Dialog has not opened yet.');
  });
}

function DialogHarness({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-10">{children}</main>;
}

describe('Marketplace dispute case file — visual regression', () => {
  beforeEach(() => {
    view.order = null;
    view.caseFile = null;
    view.isLoading = false;
    view.error = null;
    view.isParticipant = false;
    view.isDisputeOpen = false;
    view.canSubmitEvidence = false;
  });

  it('renders the participant case file with evidence at desktop viewport', async () => {
    const { disputedOrder, caseFile } = await fixtures;
    view.order = disputedOrder;
    view.caseFile = caseFile;
    view.isParticipant = true;
    view.isDisputeOpen = true;
    view.canSubmitEvidence = true;

    const screen = await renderForVRT(
      <DialogHarness>
        <MarketplaceDisputeCaseDialog orderId={disputedOrder.id} canResolve={false} />
      </DialogHarness>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await openDialog(screen.getByRole('button', { name: 'View case file' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('dispute-case-participant-desktop');
  });

  it('renders the participant case file with evidence at mobile viewport', async () => {
    const { disputedOrder, caseFile } = await fixtures;
    view.order = disputedOrder;
    view.caseFile = caseFile;
    view.isParticipant = true;
    view.isDisputeOpen = true;
    view.canSubmitEvidence = true;

    const screen = await renderForVRT(
      <DialogHarness>
        <MarketplaceDisputeCaseDialog orderId={disputedOrder.id} canResolve={false} />
      </DialogHarness>,
      { viewport: VRT_VIEWPORT_MOBILE },
    );
    await openDialog(screen.getByRole('button', { name: 'View case file' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('dispute-case-participant-mobile');
  });

  it('renders the empty case file at desktop viewport', async () => {
    const { disputedOrder, emptyCaseFile } = await fixtures;
    view.order = disputedOrder;
    view.caseFile = emptyCaseFile;
    view.isParticipant = true;
    view.isDisputeOpen = true;
    view.canSubmitEvidence = true;

    const screen = await renderForVRT(
      <DialogHarness>
        <MarketplaceDisputeCaseDialog orderId={disputedOrder.id} canResolve={false} />
      </DialogHarness>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await openDialog(screen.getByRole('button', { name: 'View case file' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('dispute-case-empty-desktop');
  });

  it('renders the inaccessible case file error at desktop viewport', async () => {
    const { disputedOrder } = await fixtures;
    view.error = 'This case file is not available to this account.';

    const screen = await renderForVRT(
      <DialogHarness>
        <MarketplaceDisputeCaseDialog orderId={disputedOrder.id} canResolve={false} />
      </DialogHarness>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await openDialog(screen.getByRole('button', { name: 'View case file' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('dispute-case-error-desktop');
  });

  it('renders the moderator resolve panel with the audit disclosure at desktop viewport', async () => {
    const { disputedOrder, caseFile } = await fixtures;
    view.order = disputedOrder;
    view.caseFile = caseFile;
    view.isDisputeOpen = true;

    const screen = await renderForVRT(
      <DialogHarness>
        <MarketplaceDisputeCaseDialog orderId={disputedOrder.id} canResolve />
      </DialogHarness>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await openDialog(screen.getByRole('button', { name: 'Open case file' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('dispute-case-resolve-desktop');
  });

  it('renders the moderator resolve panel at mobile viewport', async () => {
    const { disputedOrder, caseFile } = await fixtures;
    view.order = disputedOrder;
    view.caseFile = caseFile;
    view.isDisputeOpen = true;

    const screen = await renderForVRT(
      <DialogHarness>
        <MarketplaceDisputeCaseDialog orderId={disputedOrder.id} canResolve />
      </DialogHarness>,
      { viewport: VRT_VIEWPORT_MOBILE },
    );
    await openDialog(screen.getByRole('button', { name: 'Open case file' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('dispute-case-resolve-mobile');
  });
});
