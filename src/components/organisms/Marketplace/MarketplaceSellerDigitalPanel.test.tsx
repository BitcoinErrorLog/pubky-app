import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { MarketplaceOrder } from '@/services/marketplace/marketplace';
import { createOrderFixture } from '@/test/fixtures/commerce/orders';
import { MarketplaceSellerDigitalPanel } from './MarketplaceSellerDigitalPanel';

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    fetchOrderDeliveryEmail: vi.fn(),
    fetchOrderDigitalEvidence: vi.fn(),
    commitDeliverDigital: vi.fn(),
  },
}));

const base = createOrderFixture('paid');
type Kind = 'file' | 'link' | 'text' | 'email' | 'message';
function sellerOrder(state: MarketplaceOrder['state'], kinds: Kind[]) {
  return createOrderFixture(state, {
    fulfillment: 'digital',
    lines: kinds.map((kind) => ({ ...base.lines[0], fulfillment: 'digital' as const, digitalKind: kind })),
  });
}

describe('MarketplaceSellerDigitalPanel (digital delivery design §3 "Seller\u2019s orders", §4.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CommerceController.fetchOrderDeliveryEmail).mockResolvedValue({
      orderId: base.id,
      deliveryEmail: 'buyer@example.com',
      emailedAt: null,
    });
    vi.mocked(CommerceController.fetchOrderDigitalEvidence).mockResolvedValue({
      orderId: base.id,
      deliveredAt: null,
      firstOpenedAt: null,
      openCount: 0,
      emailedAt: null,
      messageDeliveredAt: null,
    });
  });

  it('renders nothing for an unpaid order the seller never sends by hand', () => {
    const { container } = render(
      <MarketplaceSellerDigitalPanel order={{ ...sellerOrder('pending_payment', ['file']), receiptId: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the evidence for a delivered file order: first opened and how often', async () => {
    vi.mocked(CommerceController.fetchOrderDigitalEvidence).mockResolvedValue({
      orderId: base.id,
      deliveredAt: '2026-09-26T13:01:00.000Z',
      firstOpenedAt: '2026-09-26T13:02:00.000Z',
      openCount: 3,
      emailedAt: null,
      messageDeliveredAt: null,
    });
    render(<MarketplaceSellerDigitalPanel order={sellerOrder('delivered', ['file'])} />);

    expect(await screen.findByTestId('seller-digital-evidence')).toHaveTextContent(
      /^Delivered automatically · first opened Sep 26, \d\d:\d\d · opened 3 times$/,
    );
    expect(screen.queryByRole('button', { name: 'Mark emailed' })).not.toBeInTheDocument();
  });

  it('offers Show email and Mark emailed on a paid email order, and shows the address masked with its rules', async () => {
    const user = userEvent.setup();
    render(<MarketplaceSellerDigitalPanel order={sellerOrder('paid', ['email'])} />);

    expect(screen.getByRole('button', { name: 'Mark emailed' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show email' }));

    const address = await screen.findByTestId('seller-delivery-email');
    expect(address).toHaveTextContent('buyer@example.com');
    expect(address).toHaveAttribute('data-sentry-mask');
    expect(
      screen.getByText(
        'Use this address only to deliver this order. Keep your sent email as your record: Shop deletes this address 30 days after the order ends, and PayPal disputes can come later.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide email' }));
    expect(screen.queryByTestId('seller-delivery-email')).not.toBeInTheDocument();
  });

  it('offers Mark delivered on a paid message order', () => {
    render(<MarketplaceSellerDigitalPanel order={sellerOrder('paid', ['message'])} />);

    expect(screen.getByRole('button', { name: 'Mark delivered' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show email' })).not.toBeInTheDocument();
  });

  it('shows when it was marked emailed and offers no mark once delivered', async () => {
    vi.mocked(CommerceController.fetchOrderDigitalEvidence).mockResolvedValue({
      orderId: base.id,
      deliveredAt: '2026-09-26T13:05:00.000Z',
      firstOpenedAt: null,
      openCount: 0,
      emailedAt: '2026-09-26T13:05:00.000Z',
      messageDeliveredAt: null,
    });
    render(<MarketplaceSellerDigitalPanel order={sellerOrder('delivered', ['email'])} />);

    expect(await screen.findByTestId('seller-digital-evidence')).toHaveTextContent(/^Marked emailed Sep 26, /);
    expect(screen.queryByRole('button', { name: 'Mark emailed' })).not.toBeInTheDocument();
  });

  it('offers no Show email before payment or after the order ends (F7, F8)', () => {
    const { unmount } = render(
      <MarketplaceSellerDigitalPanel order={{ ...sellerOrder('pending_payment', ['email']), receiptId: null }} />,
    );
    expect(screen.queryByRole('button', { name: 'Show email' })).not.toBeInTheDocument();
    unmount();

    render(<MarketplaceSellerDigitalPanel order={sellerOrder('refunded_external', ['email'])} />);
    expect(screen.queryByRole('button', { name: 'Show email' })).not.toBeInTheDocument();
  });

  it('keeps Show email on a cancel request, where the seller may still deliver', () => {
    render(<MarketplaceSellerDigitalPanel order={sellerOrder('cancel_requested', ['email'])} />);

    expect(screen.getByRole('button', { name: 'Show email' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark emailed' })).not.toBeInTheDocument();
  });
});
