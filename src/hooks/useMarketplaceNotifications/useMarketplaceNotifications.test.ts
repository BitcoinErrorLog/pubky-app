import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceNotifications } from './useMarketplaceNotifications';

const OWNER = 'y'.repeat(52);
const ACTOR = 'b'.repeat(52);
const NOTIFICATION_ID = '00000000-0000-4000-8000-000000000980';

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommercePollIntervalMs: () => 60_000 };
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: OWNER }),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getMarketplaceNotifications: vi.fn(),
    getMarketplaceNotificationPreferences: vi.fn(),
    executeMarketplaceCommand: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

describe('useMarketplaceNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000981');
    vi.mocked(CommerceController.getMarketplaceNotifications).mockResolvedValue([
      {
        id: NOTIFICATION_ID,
        revision: 1,
        recipientPubky: OWNER,
        actorPubky: ACTOR,
        type: 'offer_received',
        aggregateId: 'offer:test',
        createdAt: '2026-08-19T23:00:00.000Z',
        readAt: null,
      },
    ]);
    vi.mocked(CommerceController.getMarketplaceNotificationPreferences).mockResolvedValue({
      ownerPubky: OWNER,
      revision: 1,
      messages: true,
      offers: true,
      bids: true,
      auctions: true,
      updatedAt: '2026-08-19T23:00:00.000Z',
    });
    vi.mocked(CommerceController.executeMarketplaceCommand).mockResolvedValue({
      ok: true,
      version: 1,
      commandId: '00000000-0000-4000-8000-000000000981',
      aggregateId: `notification:${NOTIFICATION_ID}`,
      revision: 2,
      eventIds: ['00000000-0000-4000-8000-000000000982'],
      result: { kind: 'notification' },
    });
  });

  it('marks unread notifications with their current revisions', async () => {
    const { result } = renderHook(() => useMarketplaceNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.markAllRead());

    expect(CommerceController.executeMarketplaceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: `notification:${NOTIFICATION_ID}`,
        expectedRevision: 1,
        kind: 'notification.mark_read',
      }),
    );
    expect(result.current.unreadCount).toBe(0);
  });

  it('updates all preference categories under one revisioned command', async () => {
    const { result } = renderHook(() => useMarketplaceNotifications());
    await waitFor(() => expect(result.current.preferences?.revision).toBe(1));

    await act(() =>
      result.current.updatePreferences({
        messages: false,
        offers: true,
        bids: true,
        auctions: true,
      }),
    );

    expect(CommerceController.executeMarketplaceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: `notification_preferences:${OWNER}`,
        expectedRevision: 1,
        kind: 'notification.preferences.update',
        payload: { messages: false, offers: true, bids: true, auctions: true },
      }),
    );
  });
});
