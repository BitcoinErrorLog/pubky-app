import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOrderFixture,
  createPaymentFixture,
  ORDER_FIXTURE_BUYER,
  ORDER_FIXTURE_SELLER,
} from '@/test/fixtures/commerce/orders';
import { MarketplaceOrders } from './MarketplaceOrders';

const CURRENT_USER = ORDER_FIXTURE_BUYER;
const OTHER_USER = 'o'.repeat(52);

const ordersState = vi.hoisted(() => ({
  currentUserPubky: 'b'.repeat(52),
  orders: [] as unknown[],
}));

vi.mock('@/hooks/useMarketplaceOrders/useMarketplaceOrders', () => ({
  useMarketplaceOrders: () => ({
    orders: ordersState.orders,
    isLoading: false,
    error: null,
    needsSession: false,
    adapterMode: 'sandbox',
    refresh: vi.fn(),
    advancePayment: vi.fn(),
    actOnOrder: vi.fn(),
  }),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: ordersState.currentUserPubky }),
}));

vi.mock('@/stores/commerce/commerce.store', () => ({
  useCommerceStore: (selector: (state: { receiptsPublicationStatus: string }) => unknown) =>
    selector({ receiptsPublicationStatus: 'idle' }),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/organisms/Marketplace/MarketplaceOrderActions', () => ({
  MarketplaceOrderActions: () => <div data-testid="order-actions" />,
}));

vi.mock('@/organisms/Marketplace/MarketplacePaymentStatusCard', () => ({
  MarketplacePaymentStatusCard: () => <div data-testid="payment-status" />,
}));

vi.mock('@/organisms/Marketplace/MarketplaceMyReviews', () => ({
  MarketplaceMyReviews: () => <div data-testid="my-reviews" />,
}));

function orderView(state: Parameters<typeof createOrderFixture>[0], title: string, role: 'buyer' | 'seller') {
  const id = `test-${title.toLowerCase().replaceAll(' ', '-')}`;
  const order = createOrderFixture(state, {
    id,
    paymentId: `${id}-payment`,
    buyerPubky: role === 'buyer' ? CURRENT_USER : OTHER_USER,
    sellerPubky: role === 'seller' ? CURRENT_USER : ORDER_FIXTURE_SELLER,
    lines: [
      {
        listingAggregateId: `listing:${ORDER_FIXTURE_SELLER}_${title.replaceAll(' ', '_')}`,
        listingRevision: 1,
        contentHash: 'a'.repeat(64),
        title,
        quantity: 1,
        unitPrice: { amountMinor: 10_000, currency: 'USD', exponent: 2 },
        subtotal: { amountMinor: 10_000, currency: 'USD', exponent: 2 },
      },
    ],
  });
  return {
    order,
    payment: createPaymentFixture('confirmed', { id: order.paymentId, orderId: order.id }),
    receipt: null,
  };
}

describe('MarketplaceOrders tabs', () => {
  beforeEach(() => {
    ordersState.currentUserPubky = CURRENT_USER;
    ordersState.orders = [];
  });

  it('defaults to To ship when the user has seller orders', async () => {
    ordersState.orders = [
      orderView('paid', 'Sold paid boots', 'seller'),
      orderView('shipped', 'Bought shipped jacket', 'buyer'),
    ];

    render(<MarketplaceOrders />);

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /To ship 1/i })).toHaveAttribute('aria-selected', 'true'),
    );
    expect(screen.getByText(/Sold paid boots/)).toBeInTheDocument();
    expect(screen.queryByText(/Bought shipped jacket/)).not.toBeInTheDocument();
  });

  it('defaults to All when the user has no seller orders', () => {
    ordersState.orders = [
      orderView('pending_payment', 'Bought pending boots', 'buyer'),
      orderView('shipped', 'Bought shipped jacket', 'buyer'),
    ];

    render(<MarketplaceOrders />);

    expect(screen.getByRole('tab', { name: /All 2/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Bought pending boots/)).toBeInTheDocument();
    expect(screen.getByText(/Bought shipped jacket/)).toBeInTheDocument();
  });

  it('filters each tab by state and role while keeping counts visible', async () => {
    const user = userEvent.setup();
    ordersState.orders = [
      orderView('paid', 'Sold paid boots', 'seller'),
      orderView('paid', 'Bought paid coat', 'buyer'),
      orderView('shipped', 'Sold shipped bag', 'seller'),
      orderView('delivered', 'Bought delivered hat', 'buyer'),
      orderView('completed', 'Bought completed scarf', 'buyer'),
      orderView('refunded_external', 'Sold refunded belt', 'seller'),
      orderView('cancelled', 'Bought cancelled mittens', 'buyer'),
      orderView('return_requested', 'Sold return requested gloves', 'seller'),
    ];

    render(<MarketplaceOrders />);
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /To ship 1/i })).toHaveAttribute('aria-selected', 'true'),
    );

    expect(screen.getByRole('tab', { name: /In transit 2/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Completed 3/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /All 8/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /In transit 2/i }));
    expect(screen.getByText(/Sold shipped bag/)).toBeInTheDocument();
    expect(screen.getByText(/Bought delivered hat/)).toBeInTheDocument();
    expect(screen.queryByText(/Sold paid boots/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Completed 3/i }));
    expect(screen.getByText(/Bought completed scarf/)).toBeInTheDocument();
    expect(screen.getByText(/Sold refunded belt/)).toBeInTheDocument();
    expect(screen.getByText(/Bought cancelled mittens/)).toBeInTheDocument();
    expect(screen.queryByText(/Sold return requested gloves/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /All 8/i }));
    expect(screen.getByText(/Sold return requested gloves/)).toBeInTheDocument();
  });

  it('labels order direction from the signed-in user perspective', async () => {
    const user = userEvent.setup();
    ordersState.orders = [
      orderView('paid', 'Bought paid coat', 'buyer'),
      orderView('paid', 'Sold paid boots', 'seller'),
    ];

    render(<MarketplaceOrders />);
    await user.click(screen.getByRole('tab', { name: /All 2/i }));

    const boughtCard = screen.getByText(/Bought paid coat/).closest('[data-slot="card"]');
    const soldCard = screen.getByText(/Sold paid boots/).closest('[data-slot="card"]');
    expect(within(boughtCard as HTMLElement).getByText('You bought')).toBeInTheDocument();
    expect(within(soldCard as HTMLElement).getByText('You sold')).toBeInTheDocument();
  });
});
