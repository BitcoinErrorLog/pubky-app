import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagingController } from '@/controllers/messaging/messaging';
import { useEncryptedInbox } from './useEncryptedInbox';

const OWNER = 'o'.repeat(52);

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommercePollIntervalMs: () => 60_000 };
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: OWNER }),
}));

vi.mock('@/stores/messaging/messaging.store', () => ({
  useMessagingStore: (selector: (state: { enabledPubky: string | null }) => unknown) =>
    selector({ enabledPubky: null }),
}));

vi.mock('@/controllers/messaging/messaging', () => ({
  MessagingController: {
    getMessagingStatus: vi.fn(),
    syncInbox: vi.fn(),
    getConversations: vi.fn(),
    restartInboxRetries: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

describe('useEncryptedInbox retry backoff restarts only while someone can see it', () => {
  const restart = () => vi.mocked(MessagingController.restartInboxRetries);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MessagingController.getMessagingStatus).mockResolvedValue({
      sessionActive: true,
      receiverProvisioned: true,
    });
    vi.mocked(MessagingController.syncInbox).mockResolvedValue({ mutes: 'ready', rateLimited: 0 });
    vi.mocked(MessagingController.getConversations).mockResolvedValue({ mutes: 'ready', conversations: [] });
  });

  it('restarts on open, when the page becomes visible again (before that sync), and on Try again', async () => {
    const { result } = renderHook(() => useEncryptedInbox());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(restart()).toHaveBeenCalledTimes(1);
    expect(restart().mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(MessagingController.syncInbox).mock.invocationCallOrder[0],
    );

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(MessagingController.syncInbox).toHaveBeenCalledTimes(2));
    expect(restart()).toHaveBeenCalledTimes(2);
    expect(restart().mock.invocationCallOrder[1]).toBeLessThan(
      vi.mocked(MessagingController.syncInbox).mock.invocationCallOrder[1],
    );

    act(() => result.current.refresh());
    await waitFor(() => expect(MessagingController.syncInbox).toHaveBeenCalledTimes(3));
    expect(restart()).toHaveBeenCalledTimes(3);
  });

  it('a hidden page keeps backing off: no restart and no sync on open, a hidden visibility event, or Try again', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    try {
      const { result } = renderHook(() => useEncryptedInbox());
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      act(() => result.current.refresh());
      await act(async () => {});

      expect(restart()).not.toHaveBeenCalled();
      expect(MessagingController.syncInbox).not.toHaveBeenCalled();
    } finally {
      hidden.mockRestore();
    }
  });
});
