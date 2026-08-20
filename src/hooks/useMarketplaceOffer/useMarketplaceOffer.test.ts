import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceOffer } from './useMarketplaceOffer';

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    executeMarketplaceCommand: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

describe('useMarketplaceOffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000800');
  });

  it('submits private offer terms against the current listing revision', async () => {
    vi.mocked(CommerceController.executeMarketplaceCommand).mockResolvedValue({
      ok: true,
      version: 1,
      commandId: '00000000-0000-4000-8000-000000000800',
      aggregateId: 'listing:seller_item',
      revision: 1,
      eventIds: ['00000000-0000-4000-8000-000000000801'],
      result: { kind: 'offer' },
    });
    const { result } = renderHook(() => useMarketplaceOffer('listing:seller_item', 3));
    act(() => {
      result.current.form.setValue('amount', '100.00');
      result.current.form.setValue('quantity', '2');
      result.current.form.setValue('message', 'Would you take this?');
    });

    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.submit();
    });

    expect(succeeded).toBe(true);
    expect(CommerceController.executeMarketplaceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: 'listing:seller_item',
        expectedRevision: 3,
        kind: 'offer.create',
        payload: {
          amount: { amountMinor: 10_000, currency: 'USD', exponent: 2 },
          quantity: 2,
          expiresInSeconds: 86_400,
          message: 'Would you take this?',
        },
      }),
    );
  });

  it('does not submit without an authoritative revision', async () => {
    const { result } = renderHook(() => useMarketplaceOffer('listing:seller_item', null));
    await expect(result.current.submit()).resolves.toBe(false);
    expect(CommerceController.executeMarketplaceCommand).not.toHaveBeenCalled();
  });
});
