import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceMessages } from './useMarketplaceMessages';

const BUYER = 'b'.repeat(52);
const SELLER = 'y'.repeat(52);

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommercePollIntervalMs: () => 60_000 };
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: BUYER }),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getMarketplaceConversations: vi.fn(),
    executeMarketplaceCommand: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

describe('useMarketplaceMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CommerceController.getMarketplaceConversations).mockResolvedValue([]);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000920');
  });

  it('sends a revision-bound private listing message', async () => {
    vi.mocked(CommerceController.executeMarketplaceCommand).mockResolvedValue({
      ok: true,
      version: 1,
      commandId: '00000000-0000-4000-8000-000000000920',
      aggregateId: `conversation:${SELLER}_${BUYER}_boots_01`,
      revision: 1,
      eventIds: ['00000000-0000-4000-8000-000000000921'],
      result: { kind: 'message' },
    });
    const { result } = renderHook(() => useMarketplaceMessages(SELLER, 'boots_01'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.form.setValue('text', 'Is this still available?'));

    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.submit();
    });

    expect(succeeded).toBe(true);
    expect(CommerceController.executeMarketplaceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: `conversation:${SELLER}_${BUYER}_boots_01`,
        expectedRevision: 0,
        kind: 'message.send',
        payload: {
          listingAggregateId: `listing:${SELLER}_boots_01`,
          recipientPubky: SELLER,
          text: 'Is this still available?',
        },
      }),
    );
  });
});
