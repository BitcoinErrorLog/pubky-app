import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { createCaseFileFixture, createEvidenceFixtures } from '@/test/fixtures/commerce/evidence';
import { createOrderFixture, ORDER_FIXTURE_BUYER } from '@/test/fixtures/commerce/orders';
import { useMarketplaceDisputeCase } from './useMarketplaceDisputeCase';

const COMMAND_ID = '00000000-0000-4000-8000-000000001200';

const config = vi.hoisted(() => ({
  mode: 'transaction-service' as string,
  currentUserPubky: '' as string,
}));

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommerceAdapterMode: () => config.mode };
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: config.currentUserPubky }),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getMarketplaceOrder: vi.fn(),
    getMarketplaceOrderEvidence: vi.fn(),
    executeMarketplaceCommand: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

const disputedOrder = createOrderFixture('disputed');

function freshDisputedOrder(revision = 12) {
  return createOrderFixture('disputed', {
    revision,
    dispute: { ...createOrderFixture('disputed').dispute!, evidenceCount: 2 },
  });
}

describe('useMarketplaceDisputeCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.mode = 'transaction-service';
    config.currentUserPubky = ORDER_FIXTURE_BUYER;
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(COMMAND_ID);
    vi.mocked(CommerceController.getMarketplaceOrder).mockResolvedValue(freshDisputedOrder());
    vi.mocked(CommerceController.getMarketplaceOrderEvidence).mockResolvedValue(
      createCaseFileFixture(disputedOrder.id),
    );
    vi.mocked(CommerceController.executeMarketplaceCommand).mockResolvedValue({
      ok: true,
      version: 1,
      commandId: COMMAND_ID,
      aggregateId: `order:${disputedOrder.id}`,
      revision: 13,
      eventIds: ['00000000-0000-4000-8000-000000001201'],
      result: { kind: 'order' },
    });
  });

  it('loads nothing until activated — a moderator evidence read is audited, so it must be deliberate', async () => {
    const { result } = renderHook(() => useMarketplaceDisputeCase(disputedOrder.id, false));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.order).toBeNull();
    expect(CommerceController.getMarketplaceOrder).not.toHaveBeenCalled();
    expect(CommerceController.getMarketplaceOrderEvidence).not.toHaveBeenCalled();
  });

  it('loads the fresh order and the scoped case file when activated', async () => {
    const { result } = renderHook(() => useMarketplaceDisputeCase(disputedOrder.id, true));

    await waitFor(() => expect(result.current.order).not.toBeNull());
    expect(result.current.order).toMatchObject({ id: disputedOrder.id, revision: 12 });
    expect(result.current.caseFile).toMatchObject({ orderId: disputedOrder.id });
    expect(result.current.caseFile!.evidence).toEqual(createEvidenceFixtures());
    // The buyer is a dispute participant with an open dispute: may testify.
    expect(result.current.isParticipant).toBe(true);
    expect(result.current.canSubmitEvidence).toBe(true);
  });

  it('treats the deliberate 404 as inaccessible without claiming to know why', async () => {
    vi.mocked(CommerceController.getMarketplaceOrderEvidence).mockResolvedValue(null);

    const { result } = renderHook(() => useMarketplaceDisputeCase(disputedOrder.id, true));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe('This case file is not available to this account.');
    expect(result.current.order).toBeNull();
    expect(result.current.caseFile).toBeNull();
  });

  it('denies the evidence affordance to a signed-in stranger even if the order loads', async () => {
    config.currentUserPubky = 'z'.repeat(52);

    const { result } = renderHook(() => useMarketplaceDisputeCase(disputedOrder.id, true));

    await waitFor(() => expect(result.current.order).not.toBeNull());
    expect(result.current.isParticipant).toBe(false);
    expect(result.current.canSubmitEvidence).toBe(false);
  });

  it('submits evidence with the freshly-read order revision', async () => {
    const { result } = renderHook(() => useMarketplaceDisputeCase(disputedOrder.id, true));
    await waitFor(() => expect(result.current.order).not.toBeNull());

    let succeeded = false;
    await act(async () => {
      result.current.evidenceForm.setValue('body', 'Split soles on both boots; photos hashed.');
      succeeded = await result.current.submitEvidence();
    });

    expect(succeeded).toBe(true);
    expect(CommerceController.executeMarketplaceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: `order:${disputedOrder.id}`,
        expectedRevision: 12,
        kind: 'dispute.evidence',
        payload: { orderId: disputedOrder.id, body: 'Split soles on both boots; photos hashed.' },
      }),
    );
    // Success reloads the case file so the new item and revision render.
    expect(CommerceController.getMarketplaceOrderEvidence).toHaveBeenCalledTimes(2);
  });

  it('resolves with the freshly-read order revision and the chosen remedy', async () => {
    const { result } = renderHook(() => useMarketplaceDisputeCase(disputedOrder.id, true));
    await waitFor(() => expect(result.current.order).not.toBeNull());

    let succeeded = false;
    await act(async () => {
      result.current.resolveForm.setValue('resolution', 'seller_favor');
      result.current.resolveForm.setValue('rationale', 'Courier scans show the damage occurred after delivery.');
      succeeded = await result.current.resolve();
    });

    expect(succeeded).toBe(true);
    expect(CommerceController.executeMarketplaceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: `order:${disputedOrder.id}`,
        expectedRevision: 12,
        kind: 'dispute.resolve',
        payload: {
          orderId: disputedOrder.id,
          resolution: 'seller_favor',
          rationale: 'Courier scans show the damage occurred after delivery.',
        },
      }),
    );
  });

  it('refetches and prompts a retry on a revision conflict instead of resubmitting blindly', async () => {
    const { result } = renderHook(() => useMarketplaceDisputeCase(disputedOrder.id, true));
    await waitFor(() => expect(result.current.order).not.toBeNull());
    vi.mocked(CommerceController.executeMarketplaceCommand).mockResolvedValue({
      ok: false,
      error: { code: 'REVISION_CONFLICT', message: 'The dispute order revision is stale.', currentRevision: 14 },
    });
    vi.mocked(CommerceController.getMarketplaceOrder).mockResolvedValue(freshDisputedOrder(14));
    vi.mocked(CommerceController.getMarketplaceOrder).mockClear();

    let succeeded = true;
    await act(async () => {
      result.current.resolveForm.setValue('resolution', 'buyer_refund');
      result.current.resolveForm.setValue('rationale', 'Damage is documented.');
      succeeded = await result.current.resolve();
    });

    expect(succeeded).toBe(false);
    // The conflict reloaded the case so the retry starts from truth.
    expect(CommerceController.getMarketplaceOrder).toHaveBeenCalled();
    await waitFor(() => expect(result.current.order?.revision).toBe(14));
    const { toast } = await import('@/molecules/Toaster/use-toast');
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('reloaded') }),
    );
    expect(CommerceController.executeMarketplaceCommand).toHaveBeenCalledTimes(1);
  });

  it('never loads outside transaction-service mode', async () => {
    config.mode = 'sandbox';

    const { result } = renderHook(() => useMarketplaceDisputeCase(disputedOrder.id, true));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(CommerceController.getMarketplaceOrder).not.toHaveBeenCalled();
    expect(CommerceController.getMarketplaceOrderEvidence).not.toHaveBeenCalled();
  });
});
