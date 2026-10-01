import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagingController } from '@/controllers/messaging/messaging';
import { useEncryptedConversation } from './useEncryptedConversation';

const SELLER = 's'.repeat(52);
const BUYER = 'b'.repeat(52);
const LISTING_ID = '0033GVVN22HJ0FYQGZZS8R2BFC';

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommercePollIntervalMs: () => 60_000 };
});

vi.mock('@/stores/messaging/messaging.store', () => ({
  useMessagingStore: (selector: (state: { enabledPubky: string | null }) => unknown) =>
    selector({ enabledPubky: null }),
}));

vi.mock('@/controllers/messaging/messaging', () => ({
  MessagingController: {
    getConversationMessages: vi.fn(),
    getQueuedConversationMessages: vi.fn(),
    markConversationRead: vi.fn(),
    getMessagingStatus: vi.fn(),
    openConversation: vi.fn(),
    pollConversation: vi.fn(),
    willFollowOnSend: vi.fn(),
    restartConversationRetries: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

describe('useEncryptedConversation retry backoff restarts only while someone can see it', () => {
  const restart = () => vi.mocked(MessagingController.restartConversationRetries);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MessagingController.getConversationMessages).mockResolvedValue([]);
    vi.mocked(MessagingController.getQueuedConversationMessages).mockResolvedValue([]);
    vi.mocked(MessagingController.getMessagingStatus).mockResolvedValue({
      sessionActive: true,
      receiverProvisioned: true,
    });
    vi.mocked(MessagingController.openConversation).mockResolvedValue({
      state: { status: 'unreachable', reason: 'unreachable' },
      conversationId: `conversation:${SELLER}_${BUYER}_${LISTING_ID}`,
      counterpartyPubky: BUYER,
    });
    vi.mocked(MessagingController.pollConversation).mockResolvedValue({
      state: { status: 'unreachable', reason: 'unreachable' },
      received: [],
      flushed: 0,
      rateLimited: 0,
    });
    vi.mocked(MessagingController.willFollowOnSend).mockResolvedValue(false);
  });

  it('restarts on open, when the page becomes visible again (before that poll), and on Try again', async () => {
    const { result } = renderHook(() => useEncryptedConversation(SELLER, BUYER, LISTING_ID, true));
    await waitFor(() => expect(result.current.status).toBe('unreachable'));
    expect(restart()).toHaveBeenCalledTimes(1);
    expect(restart()).toHaveBeenCalledWith(SELLER, BUYER);

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(MessagingController.pollConversation).toHaveBeenCalledTimes(1));
    expect(restart()).toHaveBeenCalledTimes(2);
    expect(restart().mock.invocationCallOrder[1]).toBeLessThan(
      vi.mocked(MessagingController.pollConversation).mock.invocationCallOrder[0],
    );

    act(() => result.current.refresh());
    await waitFor(() => expect(MessagingController.openConversation).toHaveBeenCalledTimes(2));
    expect(restart()).toHaveBeenCalledTimes(3);
  });

  it('an inactive conversation restarts nothing', async () => {
    renderHook(() => useEncryptedConversation(SELLER, BUYER, LISTING_ID, false));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {});

    expect(restart()).not.toHaveBeenCalled();
    expect(MessagingController.openConversation).not.toHaveBeenCalled();
  });

  it('a hidden page keeps backing off: no restart on open, on a hidden visibility event, or on Try again', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    try {
      const { result } = renderHook(() => useEncryptedConversation(SELLER, BUYER, LISTING_ID, true));
      await waitFor(() => expect(MessagingController.openConversation).toHaveBeenCalledTimes(1));

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      act(() => result.current.refresh());
      await waitFor(() => expect(MessagingController.openConversation).toHaveBeenCalledTimes(2));

      expect(restart()).not.toHaveBeenCalled();
      expect(MessagingController.pollConversation).not.toHaveBeenCalled();
    } finally {
      hidden.mockRestore();
    }
  });
});
