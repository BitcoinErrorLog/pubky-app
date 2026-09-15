import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMarketplaceDisplayStore } from '@/stores/marketplace-display/marketplace-display.store';
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

vi.mock('@/hooks/useIndicativeBtcRate/useIndicativeBtcRate', () => ({
  useIndicativeBtcRate: (enabled: boolean) =>
    enabled ? { satUsd: 0.001, btcUsd: 100_000, lastUpdatedAt: new Date('2026-09-13T20:00:00Z') } : null,
}));

vi.mock('@/organisms/Marketplace/MarketplaceIndicativePrice', () => ({
  MarketplaceIndicativePrice: ({ money }: { money: { currency: string } }) =>
    money.currency === 'USD' ? <span>≈ ₿137,000</span> : null,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { currentUserPubky: string }) => unknown) =>
      selector({ currentUserPubky: ordersState.currentUserPubky }),
    {
      getState: () => ({
        currentUserPubky: ordersState.currentUserPubky,
        selectCurrentUserPubky: () => ordersState.currentUserPubky,
      }),
      setState: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    },
  ),
}));

vi.mock('@/stores/commerce/commerce.store', () => ({
  useCommerceStore: (selector: (state: { receiptsPublicationStatus: string }) => unknown) =>
    selector({ receiptsPublicationStatus: 'idle' }),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/organisms/Marketplace/MarketplacePaymentStatusCard', () => ({
  MarketplacePaymentStatusCard: () => <div data-testid="payment-status" />,
}));

vi.mock('@/organisms/Marketplace/MarketplaceMyReviews', () => ({
  MarketplaceMyReviews: () => <div data-testid="my-reviews" />,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useMarketplaceDisplayStore.setState({ showFxEstimate: false, measurementSystem: null });
});

function orderView(
  state: Parameters<typeof createOrderFixture>[0],
  title: string,
  role: 'buyer' | 'seller',
  overrides: Partial<ReturnType<typeof createOrderFixture>> = {},
  paymentState: Parameters<typeof createPaymentFixture>[0] = 'confirmed',
  paymentOverride: ReturnType<typeof createPaymentFixture> | null | undefined = undefined,
) {
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
    ...overrides,
  });
  return {
    order,
    payment:
      paymentOverride === undefined
        ? createPaymentFixture(paymentState, { id: order.paymentId, orderId: order.id })
        : paymentOverride,
    receipt: null,
  };
}

describe('MarketplaceOrders tabs', () => {
  beforeEach(() => {
    ordersState.currentUserPubky = CURRENT_USER;
    ordersState.orders = [];
    useMarketplaceDisplayStore.setState({ showFxEstimate: false, measurementSystem: null });
  });

  it('defaults to All when the user has seller orders without a next actor', async () => {
    ordersState.orders = [
      orderView('paid', 'Sold paid boots', 'seller', { nextActor: 'none' }),
      orderView('shipped', 'Bought shipped jacket', 'buyer', { nextActor: 'none' }),
    ];

    render(<MarketplaceOrders />);

    await waitFor(() => expect(screen.getByRole('tab', { name: /All 2/i })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByText(/Sold paid boots/)).toBeInTheDocument();
    expect(screen.getByText(/Bought shipped jacket/)).toBeInTheDocument();
  });

  it('defaults to All when seller orders have no service actor', async () => {
    ordersState.orders = [
      orderView('paid', 'Sold paid boots', 'seller', { nextActor: 'none' }),
      orderView('return_requested', 'Sold return requested gloves', 'seller', { nextActor: 'none' }),
      orderView('pending_payment', 'Bought pending jacket', 'buyer', { nextActor: 'none' }),
    ];

    render(<MarketplaceOrders />);

    await waitFor(() => expect(screen.getByRole('tab', { name: /All 3/i })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByText(/Sold return requested gloves/)).toBeInTheDocument();
    expect(screen.getByText(/Sold paid boots/)).toBeInTheDocument();
    expect(screen.getByText(/Bought pending jacket/)).toBeInTheDocument();
  });

  it('does not infer an action tab for a seller pending payment without a service actor', async () => {
    const user = userEvent.setup();
    ordersState.orders = [
      orderView('pending_payment', 'Sold pending boots', 'seller', { nextActor: 'none' }, 'awaiting_entitlement'),
    ];

    render(<MarketplaceOrders />);

    await user.click(screen.getByRole('tab', { name: /Needs my action 0/i }));
    expect(screen.queryByText(/Sold pending boots/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Waiting on the other side 0/i }));
    expect(screen.queryByText(/Sold pending boots/)).not.toBeInTheDocument();
  });

  it('defaults to All when the user has no seller orders', () => {
    ordersState.orders = [
      orderView('pending_payment', 'Bought pending boots', 'buyer', { nextActor: 'none' }),
      orderView('shipped', 'Bought shipped jacket', 'buyer', { nextActor: 'none' }),
    ];

    render(<MarketplaceOrders />);

    expect(screen.getByRole('tab', { name: /All 2/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Bought pending boots/)).toBeInTheDocument();
    expect(screen.getByText(/Bought shipped jacket/)).toBeInTheDocument();
  });

  it('filters each tab by state and role while keeping counts visible', async () => {
    const user = userEvent.setup();
    ordersState.orders = [
      orderView('paid', 'Sold paid boots', 'seller', { nextActor: 'none' }),
      orderView('paid', 'Bought paid coat', 'buyer', { nextActor: 'none' }),
      orderView('shipped', 'Sold shipped bag', 'seller', { nextActor: 'none' }),
      orderView('delivered', 'Bought delivered hat', 'buyer', { nextActor: 'none' }),
      orderView('completed', 'Bought completed scarf', 'buyer'),
      orderView('refunded_external', 'Sold refunded belt', 'seller'),
      orderView('cancelled', 'Bought cancelled mittens', 'buyer'),
      orderView('return_requested', 'Sold return requested gloves', 'seller'),
    ];

    render(<MarketplaceOrders />);
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Needs my action 1/i })).toHaveAttribute('aria-selected', 'true'),
    );

    expect(screen.getByRole('tab', { name: /Needs my action 1/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Needs my action 1/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /In transit 2/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Completed 2/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Cancelled 1/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /All 8/i })).toBeInTheDocument();
    expect(screen.getByText(/Sold return requested gloves/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Needs my action 1/i }));
    expect(screen.queryByText(/Sold paid boots/)).not.toBeInTheDocument();
    expect(screen.getByText(/Sold return requested gloves/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /In transit 2/i }));
    expect(screen.getByText(/Sold shipped bag/)).toBeInTheDocument();
    expect(screen.getByText(/Bought delivered hat/)).toBeInTheDocument();
    expect(screen.queryByText(/Sold paid boots/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Completed 2/i }));
    expect(screen.getByText(/Bought completed scarf/)).toBeInTheDocument();
    expect(screen.getByText(/Sold refunded belt/)).toBeInTheDocument();
    expect(screen.queryByText(/Bought cancelled mittens/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sold return requested gloves/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Cancelled 1/i }));
    expect(screen.getByText(/Bought cancelled mittens/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /All 8/i }));
    expect(screen.getByText(/Sold return requested gloves/)).toBeInTheDocument();
  });

  it('shows seller pending-payment orders in Waiting on the other side through the canonical visible status', async () => {
    const user = userEvent.setup();
    ordersState.orders = [
      orderView('pending_payment', 'Sold unpaid boots', 'seller', { nextActor: 'buyer' }, 'awaiting_entitlement'),
      orderView('pending_payment', 'Bought unpaid coat', 'buyer', { nextActor: 'buyer' }, 'awaiting_entitlement'),
      orderView('paid', 'Sold paid bag', 'seller', { nextActor: 'seller' }),
      orderView('pending_payment', 'Sold detected hat', 'seller', { nextActor: 'buyer' }, 'detected'),
      orderView('cancelled', 'Sold cancelled scarf', 'seller', { nextActor: 'none' }),
    ];

    render(<MarketplaceOrders />);

    expect(screen.getByRole('tab', { name: /Waiting on the other side 2/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /All 5/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Waiting on the other side 2/i }));
    expect(screen.getByText(/Sold unpaid boots/)).toBeInTheDocument();
    expect(screen.getByText(/Sold detected hat/)).toBeInTheDocument();
    expect(screen.queryByText(/Bought unpaid coat/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sold paid bag/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sold cancelled scarf/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /All 5/i }));
    expect(screen.getByText(/Sold unpaid boots/)).toBeInTheDocument();
    expect(screen.getByText(/Bought unpaid coat/)).toBeInTheDocument();
  });

  it('shows a payment deadline for a pending order and omits it when absent or expired', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-15T10:00:00.000Z'));
    ordersState.orders = [
      orderView('pending_payment', 'Bought deadline boots', 'buyer', {
        holdExpiresAt: '2026-09-15T10:05:00.000Z',
        nextActor: 'buyer',
      }),
    ];
    const { rerender } = render(<MarketplaceOrders />);
    expect(screen.getByText(/Complete payment by/)).toBeInTheDocument();
    expect(screen.getByText(/05:00/)).toBeInTheDocument();

    ordersState.orders = [
      orderView('pending_payment', 'Bought no deadline boots', 'buyer', { holdExpiresAt: null, nextActor: 'buyer' }),
    ];
    rerender(<MarketplaceOrders />);
    expect(screen.queryByText(/Complete payment by/)).not.toBeInTheDocument();

    ordersState.orders = [
      orderView('pending_payment', 'Bought expired boots', 'buyer', {
        holdExpiresAt: '2026-09-15T09:59:59.000Z',
        nextActor: 'buyer',
      }),
    ];
    rerender(<MarketplaceOrders />);
    expect(screen.queryByText(/Complete payment by/)).not.toBeInTheDocument();
  });

  it('puts buyer pending payment under Needs my action and leaves Waiting on the other side empty', async () => {
    ordersState.orders = [
      orderView('pending_payment', 'Bought unpaid coat', 'buyer', { nextActor: 'buyer' }, 'awaiting_entitlement'),
    ];

    render(<MarketplaceOrders />);

    expect(screen.getByRole('tab', { name: /Needs my action 1/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Waiting on the other side 0/i })).toBeInTheDocument();
    expect(screen.getByText(/Bought unpaid coat/)).toBeInTheDocument();
  });

  it('excludes buyer, confirmed, manual-review, null-payment, and same-party orders', async () => {
    const user = userEvent.setup();
    ordersState.orders = [
      orderView('pending_payment', 'Bought unpaid coat', 'buyer', { nextActor: 'buyer' }, 'awaiting_entitlement'),
      orderView('paid', 'Sold paid bag', 'seller', { nextActor: 'seller' }),
      orderView('pending_payment', 'Sold confirmed bag', 'seller', { nextActor: 'buyer' }, 'confirmed'),
      orderView('pending_payment', 'Sold manual review bag', 'seller', { nextActor: 'buyer' }, 'manual_review'),
      orderView(
        'pending_payment',
        'Sold null payment bag',
        'seller',
        { nextActor: 'buyer' },
        'awaiting_entitlement',
        null,
      ),
      orderView(
        'pending_payment',
        'Same-party bag',
        'seller',
        { buyerPubky: CURRENT_USER, nextActor: 'buyer' },
        'awaiting_entitlement',
      ),
    ];

    render(<MarketplaceOrders />);
    await user.click(screen.getByRole('tab', { name: /Waiting on the other side 0/i }));

    expect(() => expect(screen.getByText(/Bought unpaid coat/)).toBeInTheDocument()).toThrow();
    expect(() => expect(screen.getByText(/Sold paid bag/)).toBeInTheDocument()).toThrow();
    expect(() => expect(screen.getByText(/Sold confirmed bag/)).toBeInTheDocument()).toThrow();
    expect(() => expect(screen.getByText(/Sold manual review bag/)).toBeInTheDocument()).toThrow();
    expect(() => expect(screen.getByText(/Sold null payment bag/)).toBeInTheDocument()).toThrow();
    expect(() => expect(screen.getByText(/Same-party bag/)).toBeInTheDocument()).toThrow();
  });

  it('keeps the active tab semantically addressable for horizontal visibility management', () => {
    ordersState.orders = [
      orderView('pending_payment', 'Sold unpaid boots', 'seller', { nextActor: 'buyer' }, 'detected'),
    ];

    render(<MarketplaceOrders />);

    const activeTab = screen.getByRole('tab', { name: /Waiting on the other side 1/i });
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
    expect(activeTab).toHaveAttribute('role', 'tab');
  });

  it.each([
    { prefersReducedMotion: false, behavior: 'smooth' },
    { prefersReducedMotion: true, behavior: 'auto' },
  ])('scrolls a clipped active tab within the tab list ($behavior)', ({ prefersReducedMotion, behavior }) => {
    ordersState.orders = [
      orderView('pending_payment', 'Sold unpaid boots', 'seller', { nextActor: 'buyer' }, 'detected'),
      orderView('return_requested', 'Sold return requested gloves', 'seller'),
    ];
    const tabListScrollTo = vi.fn();
    const pageScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: prefersReducedMotion,
      }),
    );

    render(<MarketplaceOrders />);

    const tabList = screen.getByRole('tablist');
    const activeTab = screen.getByRole('tab', { name: /Waiting on the other side 1/i });
    Object.defineProperties(tabList, {
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, value: 20, writable: true },
      scrollTo: { configurable: true, value: tabListScrollTo },
    });
    Object.defineProperties(activeTab, {
      offsetLeft: { configurable: true, value: 160 },
      offsetWidth: { configurable: true, value: 80 },
    });

    fireEvent.click(activeTab);

    expect(tabListScrollTo).toHaveBeenCalledWith({ left: 150, behavior });
    expect(tabListScrollTo).toHaveBeenCalledTimes(1);
    expect(pageScrollTo).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it('does not scroll a visible active tab or any page container', () => {
    ordersState.orders = [
      orderView('pending_payment', 'Sold unpaid boots', 'seller', { nextActor: 'buyer' }, 'detected'),
      orderView('return_requested', 'Sold return requested gloves', 'seller'),
    ];
    const tabListScrollTo = vi.fn();
    const pageScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
      }),
    );

    render(<MarketplaceOrders />);

    const tabList = screen.getByRole('tablist');
    const activeTab = screen.getByRole('tab', { name: /Waiting on the other side 1/i });
    Object.defineProperties(tabList, {
      clientWidth: { configurable: true, value: 240 },
      scrollLeft: { configurable: true, value: 20, writable: true },
      scrollTo: { configurable: true, value: tabListScrollTo },
    });
    Object.defineProperties(activeTab, {
      offsetLeft: { configurable: true, value: 80 },
      offsetWidth: { configurable: true, value: 80 },
    });

    fireEvent.click(activeTab);

    expect(tabListScrollTo).not.toHaveBeenCalled();
    expect(pageScrollTo).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
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

  it('shows next-actor hints from the signed-in user perspective', async () => {
    const user = userEvent.setup();
    ordersState.orders = [
      orderView('paid', 'Sold paid boots', 'seller'),
      orderView('paid', 'Bought paid coat', 'buyer'),
    ];

    render(<MarketplaceOrders />);
    await user.click(screen.getByRole('tab', { name: /All 2/i }));

    const soldCard = screen.getByText(/Sold paid boots/).closest('[data-slot="card"]');
    const boughtCard = screen.getByText(/Bought paid coat/).closest('[data-slot="card"]');
    expect(within(soldCard as HTMLElement).getByText('Your move')).toBeInTheDocument();
    expect(within(boughtCard as HTMLElement).getByText('Waiting on seller')).toBeInTheDocument();
  });

  it('renders a neutral hint when the service reports no pending actor', async () => {
    ordersState.orders = [orderView('completed', 'Completed order', 'buyer', { nextActor: 'none' })];

    render(<MarketplaceOrders />);
    await userEvent.setup().click(screen.getByRole('tab', { name: /All 1/i }));

    expect(screen.getByText('No action pending')).toBeInTheDocument();
  });

  it('renders each service actor variant without inventing an actor', async () => {
    ordersState.orders = [
      orderView('pending_payment', 'Seller config needed', 'buyer', { nextActor: 'seller' }),
      orderView('pending_payment', 'Seller confirmation needed', 'seller', { nextActor: 'seller' }),
      orderView('delivered', 'Auto completion pending', 'buyer', { nextActor: 'none' }),
    ];

    render(<MarketplaceOrders />);
    await userEvent.setup().click(screen.getByRole('tab', { name: /All 3/i }));

    expect(screen.getByText('Waiting on seller')).toBeInTheDocument();
    expect(screen.getAllByText('Your move')).toHaveLength(1);
    expect(screen.getByText('No action pending')).toBeInTheDocument();
  });

  it('uses next_actor to place buyer and seller work in Needs my action', async () => {
    ordersState.orders = [
      orderView('pending_payment', 'Bought pending boots', 'buyer'),
      orderView('paid', 'Sold paid boots', 'seller'),
      orderView('completed', 'Bought completed scarf', 'buyer'),
    ];

    render(<MarketplaceOrders />);

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Needs my action 2/i })).toHaveAttribute('aria-selected', 'true'),
    );
    expect(screen.getByText(/Bought pending boots/)).toBeInTheDocument();
    expect(screen.getByText(/Sold paid boots/)).toBeInTheDocument();
    expect(screen.queryByText(/Bought completed scarf/)).not.toBeInTheDocument();
  });

  it('shows assumed-delivery copy and buyer message affordance only when delivery was assumed', async () => {
    const user = userEvent.setup();
    ordersState.orders = [
      orderView('delivered', 'Bought assumed boots', 'buyer', { deliveryAssumed: true }),
      orderView('delivered', 'Bought confirmed coat', 'buyer', { deliveryAssumed: false }),
    ];

    render(<MarketplaceOrders />);
    await user.click(screen.getByRole('tab', { name: /All 2/i }));

    const assumedCard = screen.getByText(/Bought assumed boots/).closest('[data-slot="card"]');
    const confirmedCard = screen.getByText(/Bought confirmed coat/).closest('[data-slot="card"]');
    expect(
      within(assumedCard as HTMLElement).getByText(/Marked delivered automatically after the delivery window/),
    ).toBeInTheDocument();
    expect(within(assumedCard as HTMLElement).getByRole('link', { name: 'Message seller' })).toHaveAttribute(
      'href',
      '/marketplace/messages',
    );
    expect(
      within(assumedCard as HTMLElement).getByText(/Completes automatically after the return window/),
    ).toBeInTheDocument();
    expect(
      within(confirmedCard as HTMLElement).queryByText(/Marked delivered automatically after the delivery window/),
    ).not.toBeInTheDocument();
  });

  it('keeps icon-only order card buttons accessible when they render', () => {
    ordersState.orders = [orderView('paid', 'Sold paid boots', 'seller')];

    const { container } = render(<MarketplaceOrders />);
    const iconOnlyButtons = Array.from(container.querySelectorAll('button')).filter(
      (button) => button.textContent?.trim() === '' && button.querySelector('svg') !== null,
    );

    expect(iconOnlyButtons.length).toBeGreaterThan(0);
    for (const button of iconOnlyButtons) {
      expect(button).toHaveAttribute('aria-label', expect.stringMatching(/\S/));
    }
  });

  // Quote values are the live capture of 2026-09-14 (`orders.wire.ts`); the
  // lock expired at 2026-09-13T20:15:09.050Z, so the clock is pinned on each
  // side of that instant instead of trusting the wall clock.
  const lockedQuoteOrder = () =>
    orderView('paid', 'Locked quote boots', 'seller', {
      paymentMethod: 'bitcoin',
      bitcoinQuote: {
        quotedSats: 2_588,
        currency: 'USD',
        exponent: 2,
        rate: '77287',
        source: 'blocktank',
        fetchedAt: '2026-09-13T19:14:48.286Z',
        expiresAt: '2026-09-13T20:15:09.050Z',
        spreadBps: 0,
      },
    });

  it('shows the locked Bitcoin quote while the lock is current', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-13T20:00:00.000Z'));
    ordersState.orders = [lockedQuoteOrder()];

    render(<MarketplaceOrders />);
    await userEvent.setup().click(screen.getByRole('tab', { name: /All 1/i }));

    expect(screen.getByText(/Locked Bitcoin amount: ₿2,588/)).toBeInTheDocument();
    expect(screen.queryByText(/Bitcoin quote expired/)).not.toBeInTheDocument();
    expect(screen.queryByText(/≈ ₿/)).not.toBeInTheDocument();
  });

  it('marks the locked Bitcoin quote expired once the lock has lapsed', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-13T20:15:09.051Z'));
    ordersState.orders = [lockedQuoteOrder()];

    render(<MarketplaceOrders />);
    await userEvent.setup().click(screen.getByRole('tab', { name: /All 1/i }));

    expect(screen.getByText(/Locked Bitcoin amount: ₿2,588/)).toBeInTheDocument();
    expect(screen.getByText(/ · Bitcoin quote expired/)).toBeInTheDocument();
    expect(screen.queryByText(/≈ ₿/)).not.toBeInTheDocument();
  });

  it.each([null, undefined])('shows the indicative Bitcoin estimate when the quote is %s', async (bitcoinQuote) => {
    useMarketplaceDisplayStore.setState({ showFxEstimate: true, measurementSystem: null });
    ordersState.orders = [
      orderView('paid', 'Indicative quote boots', 'buyer', {
        paymentMethod: 'bitcoin',
        bitcoinQuote,
      }),
    ];

    render(<MarketplaceOrders />);
    await userEvent.setup().click(screen.getByRole('tab', { name: /All 1/i }));

    expect(await screen.findByText('≈ ₿137,000')).toBeInTheDocument();
    expect(screen.queryByText(/Locked Bitcoin amount/)).not.toBeInTheDocument();
  });
});

describe('MarketplaceOrders local pickup cards (Wave 7, §A3/§A6)', () => {
  beforeEach(() => {
    ordersState.currentUserPubky = CURRENT_USER;
    ordersState.orders = [];
  });

  it('renders plain-language pickup labels and the Local pickup badge on the buyer card', () => {
    ordersState.orders = [
      orderView('ready_for_pickup', 'Bought pickup boots', 'buyer', { fulfillment: 'pickup', nextActor: 'buyer' }),
    ];

    render(<MarketplaceOrders />);

    const card = screen.getByText(/Bought pickup boots/).closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText('Local pickup')).toBeInTheDocument();
    expect(within(card).getByText('Ready for pickup')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Show meeting point' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Confirm handover' })).toBeInTheDocument();
  });

  it('labels a delivered pickup order as picked up', () => {
    ordersState.orders = [
      orderView('delivered', 'Bought pickup boots', 'buyer', { fulfillment: 'pickup', nextActor: 'none' }),
    ];

    render(<MarketplaceOrders />);

    const card = screen.getByText(/Bought pickup boots/).closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText('Picked up')).toBeInTheDocument();
  });

  it('warns the buyer when the pickup terms changed after payment (§A3)', () => {
    ordersState.orders = [
      orderView('paid', 'Bought pickup boots', 'buyer', {
        fulfillment: 'pickup',
        nextActor: 'seller',
        pickupTermsChanged: true,
      }),
    ];

    render(<MarketplaceOrders />);

    const card = screen.getByText(/Bought pickup boots/).closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText(/The seller changed the pickup terms since you paid/)).toBeInTheDocument();
  });

  it('shows the seller Mark ready for pickup on a paid pickup order', () => {
    ordersState.orders = [orderView('paid', 'Sold pickup boots', 'seller', { fulfillment: 'pickup' })];

    render(<MarketplaceOrders />);

    const card = screen.getByText(/Sold pickup boots/).closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByRole('button', { name: 'Mark ready for pickup' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Add tracking' })).not.toBeInTheDocument();
  });
});
