import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  marketplaceDisputeEvidenceFormDefaults,
  marketplaceDisputeResolveFormDefaults,
} from '@/hooks/useMarketplaceDisputeCase/useMarketplaceDisputeCase.types';
import { createCaseFileFixture } from '@/test/fixtures/commerce/evidence';
import { createOrderFixture } from '@/test/fixtures/commerce/orders';
import { MarketplaceDisputeCaseDialog } from './MarketplaceDisputeCaseDialog';

const view = vi.hoisted(() => ({
  order: null as unknown,
  caseFile: null as unknown,
  isLoading: false,
  error: null as string | null,
  isParticipant: false,
  isDisputeOpen: false,
  canSubmitEvidence: false,
}));

vi.mock('@/hooks/useMarketplaceDisputeCase/useMarketplaceDisputeCase', async () => {
  const { useForm } = await import('react-hook-form');
  return {
    useMarketplaceDisputeCase: () => ({
      order: view.order,
      caseFile: view.caseFile,
      isLoading: view.isLoading,
      error: view.error,
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

const disputedOrder = createOrderFixture('disputed');
const caseFile = createCaseFileFixture(disputedOrder.id);

async function openDialog(triggerName: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: triggerName }));
}

describe('MarketplaceDisputeCaseDialog', () => {
  beforeEach(() => {
    view.order = disputedOrder;
    view.caseFile = caseFile;
    view.isLoading = false;
    view.error = null;
    view.isParticipant = true;
    view.isDisputeOpen = true;
    view.canSubmitEvidence = true;
  });

  it('tells a moderator plainly that opening the case file is a logged action', async () => {
    render(<MarketplaceDisputeCaseDialog orderId={disputedOrder.id} canResolve />);

    await openDialog('Open case file');

    expect(screen.getByText(/Your access is logged/)).toBeInTheDocument();
    expect(screen.getByText(/in the same transaction as the read itself/)).toBeInTheDocument();
    expect(screen.getByText('Resolve this dispute')).toBeInTheDocument();
  });

  it('shows participants the full case file with the audit fact, without moderator affordances', async () => {
    render(<MarketplaceDisputeCaseDialog orderId={disputedOrder.id} canResolve={false} />);

    await openDialog('View case file');

    expect(screen.getByText(/Both dispute participants see the full case file/)).toBeInTheDocument();
    expect(screen.getByText(/Moderator access to case files is recorded by the service/)).toBeInTheDocument();
    expect(screen.queryByText('Resolve this dispute')).not.toBeInTheDocument();
    // Evidence bodies come from the scoped read, both parties' items visible.
    for (const item of caseFile.evidence) {
      expect(screen.getByText(item.body)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Add to case file' })).toBeInTheDocument();
  });

  it('withholds the evidence form from non-participants and resolved disputes', async () => {
    view.canSubmitEvidence = false;
    render(<MarketplaceDisputeCaseDialog orderId={disputedOrder.id} canResolve={false} />);

    await openDialog('View case file');

    expect(screen.queryByRole('button', { name: 'Add to case file' })).not.toBeInTheDocument();
  });

  it('renders an explicit empty state when the case file has no evidence', async () => {
    view.caseFile = createCaseFileFixture(disputedOrder.id, []);
    render(<MarketplaceDisputeCaseDialog orderId={disputedOrder.id} canResolve />);

    await openDialog('Open case file');

    expect(screen.getByText('No evidence has been submitted for this dispute.')).toBeInTheDocument();
  });

  it('surfaces the case-file error state', async () => {
    view.order = null;
    view.caseFile = null;
    view.error = 'This case file is not available to this account.';
    render(<MarketplaceDisputeCaseDialog orderId={disputedOrder.id} canResolve={false} />);

    await openDialog('View case file');

    expect(screen.getByRole('alert')).toHaveTextContent('This case file is not available to this account.');
  });
});
