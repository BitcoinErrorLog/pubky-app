import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useLocksPayment } from './useLocksPayment';

const CREATOR = 'y'.repeat(52);
const BUNDLE_ID = '000G40R40M30E209185GR38E1W';

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommercePollIntervalMs: () => 1_000 };
});

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    generateLocksBundleId: vi.fn(),
    submitLocksPaykitProof: vi.fn(),
    lookupLocksVerification: vi.fn(),
    issueLocksAccessCredential: vi.fn(),
  },
}));

function lifecycle(status: 'pending' | 'completed' | 'failed' | 'expired' = 'pending') {
  return {
    creator: `pubky${CREATOR}`,
    bundle_id: BUNDLE_ID,
    status,
    submitted_at: '2026-08-19T23:00:00.000Z',
    started_at: null,
    completed_at: status === 'completed' ? '2026-08-19T23:01:00.000Z' : null,
    failure_message: null,
  };
}

function renderPayment() {
  return renderHook(() =>
    useLocksPayment({
      creatorPubky: CREATOR,
      lockResource: `pubky://${CREATOR}/pub/locks.app/lock.json`,
      criterionId: 'criterion-1',
    }),
  );
}

describe('useLocksPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CommerceController.generateLocksBundleId).mockResolvedValue(BUNDLE_ID);
    vi.mocked(CommerceController.submitLocksPaykitProof).mockResolvedValue(lifecycle());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('submits the Paykit criterion with an SDK-generated bundle id and no wallet material', async () => {
    const { result } = renderPayment();

    await act(() => result.current.start());

    expect(CommerceController.generateLocksBundleId).toHaveBeenCalledTimes(1);
    expect(CommerceController.submitLocksPaykitProof).toHaveBeenCalledWith({
      creatorPubky: CREATOR,
      bundleId: BUNDLE_ID,
      lockResource: `pubky://${CREATOR}/pub/locks.app/lock.json`,
      criterionId: 'criterion-1',
    });
    expect(result.current.lifecycle?.status).toBe('pending');
    expect(result.current.credential).toBeNull();
  });

  it('surfaces an error when the bundle id cannot be generated', async () => {
    vi.mocked(CommerceController.generateLocksBundleId).mockRejectedValue(new Error('wasm failed to load'));
    const { result } = renderPayment();

    await act(() => result.current.start());

    expect(CommerceController.submitLocksPaykitProof).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Could not create the Locks/Paykit payment request.');
  });

  it('stops polling once the verification task reaches a terminal expired state', async () => {
    vi.useFakeTimers();
    vi.mocked(CommerceController.submitLocksPaykitProof).mockResolvedValue(lifecycle('expired'));
    const { result } = renderPayment();

    await act(() => result.current.start());
    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(result.current.lifecycle?.status).toBe('expired');
    expect(CommerceController.lookupLocksVerification).not.toHaveBeenCalled();
  });
});
