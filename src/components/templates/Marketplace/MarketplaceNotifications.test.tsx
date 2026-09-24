import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { MarketplaceNotifications } from './MarketplaceNotifications';

const authStoreState = vi.hoisted(() => ({ session: {} as unknown }));
const markAllSeen = vi.hoisted(() => vi.fn(async () => {}));
const marketplaceView = vi.hoisted(() => ({ notifications: [] as unknown[] }));
const ordersView = vi.hoisted(() => ({
  orders: [] as {
    order: {
      id: string;
      state?: string;
      total?: { amountMinor: number; currency: string; exponent: number };
      externalRefund?: { amountMinor: number } | null;
      returnRequest?: { reason?: string | null } | null;
    };
  }[],
  isLoading: false,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { session: unknown | null }) => unknown) => selector(authStoreState),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    markActivityRead: vi.fn(async () => {}),
  },
}));

vi.mock('@/hooks/useMarketplaceOrders/useMarketplaceOrders', () => ({
  useMarketplaceOrders: () => ordersView,
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
vi.mock('@/organisms/Marketplace/MarketplaceSectionNav', () => ({
  MarketplaceSectionNav: () => <nav data-testid="marketplace-section-nav" />,
}));

describe('MarketplaceNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStoreState.session = {};
    marketplaceView.notifications = [];
    ordersView.orders = [];
    ordersView.isLoading = false;
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

    const { getByText, queryByText } = render(<MarketplaceNotifications />);

    expect(getByText('From System')).toBeInTheDocument();
    expect(getByText('Payment method connected')).toBeInTheDocument();
    expect(queryByText(/history may be incomplete/)).not.toBeInTheDocument();
    expect(queryByText('Integrity notice')).not.toBeInTheDocument();
    expect(queryByText(/not available yet/)).not.toBeInTheDocument();
  });

  it('keeps the incomplete-history banner for a type the Shop has no copy for', () => {
    marketplaceView.notifications = [
      {
        kind: 'unrecognized',
        id: 'row-gap',
        type: 'payment_hold_acquired_unknown',
        createdAt: '2026-08-20T11:02:00.000Z',
      },
    ];

    render(<MarketplaceNotifications />);

    expect(screen.getByRole('status')).toHaveTextContent(/history may be incomplete/);
    expect(screen.getByText('Integrity notice')).toBeInTheDocument();
    expect(screen.getByText('Unrecognized marketplace event')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Unrecognized marketplace event' })).not.toBeInTheDocument();
  });

  it('links a new offer activity row to its offer anchor', () => {
    marketplaceView.notifications = [
      {
        id: '00000000-0000-4000-8000-000000000932',
        recipientPubky: 'y'.repeat(52),
        actorPubky: 'b'.repeat(52),
        type: 'offer_received',
        aggregateId: 'offer:00000000-0000-4000-8000-000000000933',
        createdAt: '2026-08-20T11:00:00.000Z',
        readAt: null,
      },
    ];

    render(<MarketplaceNotifications />);

    const link = screen.getByRole('link', { name: 'New offer received' });
    expect(link).toHaveAttribute('href', '/marketplace/offers#offer-00000000-0000-4000-8000-000000000933');
    expect(link.tagName).toBe('A');
    expect(link).not.toHaveAttribute('tabindex', '-1');
  });

  it('links an order event to that order and a message to its thread', () => {
    const orderId = '018f47d2-6a27-7c23-a62f-000000000001';
    const seller = 's'.repeat(52);
    const buyer = 'b'.repeat(52);
    const conversation = `conversation:${seller}_${buyer}_listing-1`;
    marketplaceView.notifications = [
      {
        id: '00000000-0000-4000-8000-000000000934',
        recipientPubky: 'y'.repeat(52),
        actorPubky: buyer,
        type: 'payment_confirmed',
        aggregateId: `order:${orderId}`,
        createdAt: '2026-08-20T11:00:00.000Z',
        readAt: null,
      },
      {
        id: '00000000-0000-4000-8000-000000000935',
        recipientPubky: 'y'.repeat(52),
        actorPubky: buyer,
        type: 'message_received',
        aggregateId: conversation,
        createdAt: '2026-08-20T11:01:00.000Z',
        readAt: null,
      },
    ];

    render(<MarketplaceNotifications />);

    expect(screen.getByRole('link', { name: 'Payment confirmed' })).toHaveAttribute(
      'href',
      `/marketplace/orders#order-${orderId}`,
    );
    expect(screen.getByRole('link', { name: 'New marketplace message' })).toHaveAttribute(
      'href',
      `/marketplace/messages?conversation=${encodeURIComponent(conversation)}`,
    );
  });

  it('says what a return update was, in the order the events happened', () => {
    const orderId = '018f47d2-6a27-7c23-a62f-000000000001';
    ordersView.orders = [{ order: { id: orderId, returnRequest: { reason: 'mistake on my part' } } }];
    marketplaceView.notifications = [
      {
        id: '00000000-0000-4000-8000-000000000942',
        recipientPubky: 'y'.repeat(52),
        actorPubky: 's'.repeat(52),
        type: 'return_updated',
        aggregateId: `order:${orderId}`,
        createdAt: '2026-08-19T00:00:00.000Z',
        readAt: null,
      },
      {
        id: '00000000-0000-4000-8000-000000000941',
        recipientPubky: 'y'.repeat(52),
        actorPubky: 'b'.repeat(52),
        type: 'return_updated',
        aggregateId: `order:${orderId}`,
        createdAt: '2026-08-14T00:00:00.000Z',
        readAt: null,
      },
    ];

    render(<MarketplaceNotifications />);

    expect(screen.getByRole('link', { name: 'Return requested — mistake on my part' })).toHaveAttribute(
      'href',
      `/marketplace/orders#order-${orderId}`,
    );
    expect(screen.getByRole('link', { name: 'Return approved' })).toHaveAttribute(
      'href',
      `/marketplace/orders#order-${orderId}`,
    );
  });

  it('names a partial refund on the activity row and links that order', () => {
    const orderId = '018f47d2-6a27-7c23-a62f-000000000001';
    ordersView.orders = [
      {
        order: {
          id: orderId,
          state: 'refunded_external',
          total: { amountMinor: 250, currency: 'USD', exponent: 2 },
          externalRefund: { amountMinor: 189 },
        },
      },
    ];
    marketplaceView.notifications = [
      {
        id: '00000000-0000-4000-8000-000000000943',
        recipientPubky: 'y'.repeat(52),
        actorPubky: 's'.repeat(52),
        type: 'refund_recorded',
        aggregateId: `order:${orderId}`,
        createdAt: '2026-08-20T11:00:00.000Z',
        readAt: null,
      },
    ];

    render(<MarketplaceNotifications />);

    expect(screen.getByRole('link', { name: 'Refunded $1.89 of $2.50' })).toHaveAttribute(
      'href',
      `/marketplace/orders#order-${orderId}`,
    );
  });

  it('keeps the full-refund activity label when the recorded amount matches the total', () => {
    const orderId = '018f47d2-6a27-7c23-a62f-000000000002';
    ordersView.orders = [
      {
        order: {
          id: orderId,
          state: 'refunded_external',
          total: { amountMinor: 250, currency: 'USD', exponent: 2 },
          externalRefund: { amountMinor: 250 },
        },
      },
    ];
    marketplaceView.notifications = [
      {
        id: '00000000-0000-4000-8000-000000000944',
        recipientPubky: 'y'.repeat(52),
        actorPubky: 's'.repeat(52),
        type: 'refund_recorded',
        aggregateId: `order:${orderId}`,
        createdAt: '2026-08-20T11:00:00.000Z',
        readAt: null,
      },
    ];

    render(<MarketplaceNotifications />);

    expect(screen.getByRole('link', { name: 'External refund recorded' })).toHaveAttribute(
      'href',
      `/marketplace/orders#order-${orderId}`,
    );
  });

  it('still links a known event whose row failed schema checks', () => {
    marketplaceView.notifications = [
      {
        kind: 'unrecognized',
        id: 'row-known',
        type: 'payment_method_bound',
        createdAt: '2026-08-20T11:01:00.000Z',
      },
    ];

    render(<MarketplaceNotifications />);

    expect(screen.getByRole('link', { name: 'Payment method connected' })).toHaveAttribute(
      'href',
      '/marketplace/orders',
    );
  });
});
