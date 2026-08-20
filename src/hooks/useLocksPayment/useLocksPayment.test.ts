import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useLocksPayment } from './useLocksPayment';

const CREATOR = 'y'.repeat(52);
const BUNDLE_ID = '00000000-0000-4000-8000-000000001200'.replaceAll('-', '');

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommercePollIntervalMs: () => 1_000 };
});

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    submitLocksPaykitProof: vi.fn(),
    lookupLocksVerification: vi.fn(),
    issueLocksAccessCredential: vi.fn(),
  },
}));

describe('useLocksPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000001200');
    vi.mocked(CommerceController.submitLocksPaykitProof).mockResolvedValue({
      creator: `pubky${CREATOR}`,
      bundle_id: BUNDLE_ID,
      status: 'pending',
      submitted_at: '2026-08-19T23:00:00.000Z',
      started_at: null,
      completed_at: null,
      failure_message: null,
    });
  });

  it('submits the Paykit criterion through Locks without wallet material', async () => {
    const { result } = renderHook(() =>
      useLocksPayment({
        creatorPubky: CREATOR,
        lockResource: `pubky://${CREATOR}/pub/locks.app/lock.json`,
        criterionId: 'criterion-1',
      }),
    );

    await act(() => result.current.start());

    expect(CommerceController.submitLocksPaykitProof).toHaveBeenCalledWith({
      creatorPubky: CREATOR,
      bundleId: BUNDLE_ID,
      lockResource: `pubky://${CREATOR}/pub/locks.app/lock.json`,
      criterionId: 'criterion-1',
    });
    expect(result.current.lifecycle?.status).toBe('pending');
    expect(result.current.credential).toBeNull();
  });
});
