import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { MarketplaceNotifications } from './MarketplaceNotifications';

const authStoreState = vi.hoisted(() => ({ session: {} as unknown }));
const markAllSeen = vi.hoisted(() => vi.fn(async () => {}));
const marketplaceView = vi.hoisted(() => ({ notifications: [] as unknown[] }));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { session: unknown | null }) => unknown) => selector(authStoreState),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    markActivityRead: vi.fn(async () => {}),
  },
}));

vi.mock('@/hooks/useMarketplaceNotifications/useMarketplaceNotifications', () => ({
  useMarketplaceNotifications: () => ({
    notifications: marketplaceView.notifications,
    preferences: null,
    unreadCount: 0,
    isLoading: false,
    error: null,
    needsSession: false,
    canMarkRead: false,
    markAllRead: vi.fn(),
    updatePreferences: vi.fn(),
  }),
}));

vi.mock('@/hooks/useMarketplaceWatchAlertFeed/useMarketplaceWatchAlertFeed', () => ({
  useMarketplaceWatchAlertFeed: () => ({ items: [], markAllSeen }),
}));

vi.mock('@/hooks/useMarketplaceWatchDetection/useMarketplaceWatchDetection', () => ({
  useMarketplaceWatchDetection: () => {},
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

describe('MarketplaceNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStoreState.session = {};
    marketplaceView.notifications = [];
  });

  it('clears the device-local read state on entry: watch alerts seen, activity checkpoint advanced', async () => {
    render(<MarketplaceNotifications />);

    await waitFor(() => expect(markAllSeen).toHaveBeenCalledOnce());
    expect(CommerceController.markActivityRead).toHaveBeenCalledOnce();
  });

  it('does not touch device-local read state while no session is restored', () => {
    authStoreState.session = null;

    render(<MarketplaceNotifications />);

    expect(markAllSeen).not.toHaveBeenCalled();
    expect(CommerceController.markActivityRead).not.toHaveBeenCalled();
  });

  it('renders system actors and quarantined rows without failing the history list', () => {
    marketplaceView.notifications = [
      {
        id: '00000000-0000-4000-8000-000000000931',
        recipientPubky: 'y'.repeat(52),
        actorPubky: 'system',
        type: 'payment_confirmed',
        aggregateId: 'order:placeholder',
        createdAt: '2026-08-20T11:00:00.000Z',
        readAt: null,
      },
      {
        kind: 'unrecognized',
        id: 'row-1',
        type: 'payment_method_bound',
        createdAt: '2026-08-20T11:01:00.000Z',
      },
    ];

    const { getByText } = render(<MarketplaceNotifications />);

    expect(getByText('From System')).toBeInTheDocument();
    expect(getByText('Unrecognized marketplace event — history may be incomplete')).toBeInTheDocument();
  });
});
