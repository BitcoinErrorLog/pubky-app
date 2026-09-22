import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceOrderPayment } from '@/hooks/useMarketplaceOrderPayment/useMarketplaceOrderPayment';
import {
  CHECKOUT_HOLD_COPY,
  holderBoundCopy,
  holderUnboundCopy,
  UNBOUND_BACK_CANCEL_REASON,
} from '@/libs/commerce/checkout-hold';
import { createOrderFixture, createPaymentFixture } from '@/test/fixtures/commerce/orders';
import { MarketplacePaymentStatusCard } from './MarketplacePaymentStatusCard';

const runtime = vi.hoisted(() => ({ deployEnv: 'production' as 'production' | 'staging' | undefined }));
const auth = vi.hoisted(() => ({ currentUserPubky: 's'.repeat(52) }));

vi.mock('@/libs/runtime-config/runtime-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/runtime-config/runtime-config')>();
  return { ...actual, getDeployEnv: () => runtime.deployEnv };
});

vi.mock('@/hooks/useMarketplaceLocksPayment/useMarketplaceLocksPayment', () => ({
  useMarketplaceLocksPayment: () => ({
    enabled: false,
    correlation: null,
    isStarting: false,
    isUnlocking: false,
    delivery: null,
    error: null,
    pollExhausted: false,
    start: vi.fn(),
    unlock: vi.fn(),
    resumePolling: vi.fn(),
  }),
}));

vi.mock('@/hooks/useMarketplaceOrderPayment/useMarketplaceOrderPayment', () => ({
  useMarketplaceOrderPayment: vi.fn(() => ({
    availableMethods: null,
    bitcoinOfferUnavailable: false,
    configError: null,
    pendingAction: null,
    bind: vi.fn(),
    verifyStripe: vi.fn(),
    markPaid: vi.fn(),
    confirmReceived: vi.fn(),
  })),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getOrFetchListing: vi.fn(async () => ({ digitalLock: null })),
    executeMarketplaceCommand: vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: auth.currentUserPubky }),
}));

describe('MarketplacePaymentStatusCard', () => {
  beforeEach(() => {
    runtime.deployEnv = 'production';
    auth.currentUserPubky = 's'.repeat(52);
    vi.mocked(useMarketplaceOrderPayment).mockReturnValue({
      availableMethods: null,
      bitcoinOfferUnavailable: false,
      configError: null,
      pendingAction: null,
      bind: vi.fn(),
      verifyStripe: vi.fn(),
      markPaid: vi.fn(),
      confirmReceived: vi.fn(),
    });
  });

  it('renders every null seller observation fact as Not provided without hiding the CTA', () => {
    const payment = createPaymentFixture('awaiting_entitlement', { adapter: 'paykit' });
    const order = createOrderFixture('pending_payment', {
      paymentId: payment.id,
      paymentMethod: 'bitcoin',
      paykitRequestState: 'awaiting_seller_confirmation',
      paykitObservation: {
        txid: null,
        observedSats: null,
        confirmations: null,
        amountMatched: null,
        disappeared: null,
        observedAt: null,
      },
    });

    render(
      <MarketplacePaymentStatusCard
        order={order}
        payment={payment}
        isBuyer={false}
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );

    expect(screen.getByText('Review Bitcoin payment')).toBeInTheDocument();
    expect(screen.getAllByText('Not provided')).toHaveLength(7);
  });

  it('focuses the confirmation reason after static validation fails', async () => {
    const payment = createPaymentFixture('awaiting_entitlement', { adapter: 'paykit' });
    const order = createOrderFixture('pending_payment', {
      paymentId: payment.id,
      paymentMethod: 'bitcoin',
      paykitRequestState: 'awaiting_seller_confirmation',
      paykitObservation: {},
    });
    render(
      <MarketplacePaymentStatusCard
        order={order}
        payment={payment}
        isBuyer={false}
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );

    const reason = screen.getByLabelText('Seller note (optional)');
    fireEvent.change(reason, { target: { value: 'x'.repeat(501) } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment received' }));

    await waitFor(() => expect(reason).toHaveFocus());
  });

  it.each(['transaction-service', 'locks-paykit', 'unavailable'] as const)(
    'does not show a production money warning in %s mode',
    (adapterMode) => {
      render(
        <MarketplacePaymentStatusCard
          order={createOrderFixture('pending_payment')}
          payment={createPaymentFixture('awaiting_entitlement')}
          isBuyer
          adapterMode={adapterMode}
          advancePayment={async () => false}
          onPaymentChanged={() => {}}
        />,
      );

      expect(screen.queryByRole('note')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Real money. Payments are final and go directly to the seller.'),
      ).not.toBeInTheDocument();
    },
  );

  it('shows the staging notice on a staging deploy', () => {
    runtime.deployEnv = 'staging';
    render(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('pending_payment')}
        payment={createPaymentFixture('awaiting_entitlement')}
        isBuyer
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );

    expect(screen.getByRole('note')).toHaveTextContent('Staging environment — test rails, no real funds move');
    expect(screen.queryByText(/Real money/)).not.toBeInTheDocument();
  });

  it('does not show a production money warning when the deploy environment is unknown', () => {
    runtime.deployEnv = undefined;
    render(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('pending_payment')}
        payment={createPaymentFixture('awaiting_entitlement')}
        isBuyer
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByText(/Real money/)).not.toBeInTheDocument();
  });

  it('shows the sandbox badge without any payment notice, even on a staging deploy', () => {
    runtime.deployEnv = 'staging';
    render(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('pending_payment')}
        payment={createPaymentFixture('awaiting_entitlement')}
        isBuyer
        adapterMode="sandbox"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );

    expect(screen.getByText('Sandbox · simulated payment · no real funds')).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('does not show the payment notice for sellers or terminal orders', () => {
    const payment = createPaymentFixture('awaiting_entitlement');
    const seller = render(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('pending_payment', { paymentId: payment.id })}
        payment={payment}
        isBuyer={false}
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );
    expect(seller.queryByRole('note')).not.toBeInTheDocument();

    seller.unmount();
    render(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('completed', { paymentId: payment.id })}
        payment={payment}
        isBuyer
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('explains that PayPal buyer self-reporting does not confirm marketplace payment', () => {
    const payment = createPaymentFixture('awaiting_entitlement');
    const order = createOrderFixture('pending_payment', {
      paymentId: payment.id,
      paymentMethod: 'paypal',
      fiatCheckoutUrl: 'https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=seller%40example.com',
      fiatVerification: 'seller-attested',
    });

    render(
      <MarketplacePaymentStatusCard
        order={order}
        payment={payment}
        isBuyer
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );

    expect(screen.getByText(/Use this only if automatic confirmation fails/i)).toBeInTheDocument();
    expect(screen.getByText(/seller must verify your PayPal transaction ID before shipping/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /I.ve paid/ })).toBeInTheDocument();
  });

  it('explains when Bitcoin is temporarily unavailable while other methods remain available', () => {
    vi.mocked(useMarketplaceOrderPayment).mockReturnValue({
      availableMethods: ['stripe'],
      bitcoinOfferUnavailable: true,
      configError: null,
      pendingAction: null,
      bind: vi.fn(),
      verifyStripe: vi.fn(),
      markPaid: vi.fn(),
      confirmReceived: vi.fn(),
    });

    render(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('pending_payment')}
        payment={createPaymentFixture('awaiting_entitlement')}
        isBuyer
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );

    expect(
      screen.getByText('Bitcoin is temporarily unavailable. Other payment methods are unaffected.'),
    ).toBeInTheDocument();
    expect(screen.getByText('The item is held for you once a payment starts.')).toBeInTheDocument();
    expect(screen.queryByText(/never holds funds/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Card \(Stripe\)/ })).toBeInTheDocument();
  });

  it.each(['cancelled', 'refunded_external', 'closed', 'completed'] as const)(
    'does not show payment instructions for terminal %s orders',
    (state) => {
      const payment = createPaymentFixture('awaiting_entitlement');

      render(
        <MarketplacePaymentStatusCard
          order={createOrderFixture(state, { paymentId: payment.id })}
          payment={payment}
          isBuyer
          adapterMode="transaction-service"
          advancePayment={async () => false}
          onPaymentChanged={() => {}}
        />,
      );

      expect(screen.queryByText('Awaiting payment')).not.toBeInTheDocument();
      expect(screen.queryByText(/seller has not set up any payment methods/i)).not.toBeInTheDocument();
    },
  );

  it('keeps confirmed Locks delivery visible after order completion', () => {
    const payment = createPaymentFixture('confirmed', { adapter: 'locks' });

    render(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('completed', { paymentId: payment.id })}
        payment={payment}
        isBuyer
        adapterMode="locks-paykit"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );

    expect(screen.getByText('Payment confirmed')).toBeInTheDocument();
  });

  it('renders unbound hold copy and Back cancel on the method picker', async () => {
    const onPaymentChanged = vi.fn();
    vi.mocked(useMarketplaceOrderPayment).mockReturnValue({
      availableMethods: ['bitcoin', 'stripe', 'paypal'],
      bitcoinOfferUnavailable: false,
      configError: null,
      pendingAction: null,
      bind: vi.fn(),
      verifyStripe: vi.fn(),
      markPaid: vi.fn(),
      confirmReceived: vi.fn(),
    });
    const holdExpiresAt = '2026-08-20T21:15:00.000Z';
    render(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('pending_payment', { holdExpiresAt, holdSource: 'checkout' })}
        payment={createPaymentFixture('awaiting_entitlement')}
        isBuyer
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={onPaymentChanged}
      />,
    );

    expect(screen.getByText(holderUnboundCopy(holdExpiresAt))).toBeInTheDocument();
    expect(screen.queryByText('Real money. Payments are final and go directly to the seller.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Choose how to pay/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pays the seller directly/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/never holds funds/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() =>
      expect(CommerceController.executeMarketplaceCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'order.cancel_request',
          payload: expect.objectContaining({ reason: UNBOUND_BACK_CANCEL_REASON }),
        }),
      ),
    );
    await waitFor(() => expect(onPaymentChanged).toHaveBeenCalled());
  });

  it('renders bound hold copy after a payment method is chosen', () => {
    const holdExpiresAt = '2026-08-20T21:15:00.000Z';
    render(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('pending_payment', {
          holdExpiresAt,
          holdSource: 'bind',
          paymentMethod: 'bitcoin',
          paykitRequestState: 'pending',
        })}
        payment={createPaymentFixture('awaiting_entitlement', { adapter: 'paykit' })}
        isBuyer
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );

    expect(screen.getByText(holderBoundCopy(holdExpiresAt))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('renders late-completion copy for buyer and seller', () => {
    const payment = createPaymentFixture('confirmed');
    const { rerender } = render(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('paid', {
          paymentId: payment.id,
          cancellationReason: 'payment window elapsed',
        })}
        payment={payment}
        isBuyer
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );
    expect(screen.getByText(CHECKOUT_HOLD_COPY.lateCompleteBuyer)).toBeInTheDocument();

    rerender(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('paid', {
          paymentId: payment.id,
          cancellationReason: 'payment window elapsed',
        })}
        payment={payment}
        isBuyer={false}
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );
    expect(screen.getByText(CHECKOUT_HOLD_COPY.lateCompleteSeller)).toBeInTheDocument();
  });

  it('renders refund_required copy for the buyer without seller bitcoin instructions', () => {
    auth.currentUserPubky = 'b'.repeat(52);
    const payment = createPaymentFixture('manual_review', {
      adapter: 'paykit',
      reviewReason: 'refund_required',
    });
    render(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('cancelled', {
          paymentId: payment.id,
          paymentMethod: 'bitcoin',
          cancellationReason: 'payment window elapsed',
        })}
        payment={payment}
        isBuyer
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );

    expect(screen.getByText(CHECKOUT_HOLD_COPY.refundRequiredBuyer)).toBeInTheDocument();
    expect(screen.queryByText(CHECKOUT_HOLD_COPY.refundRequiredBitcoinSeller)).not.toBeInTheDocument();
    expect(screen.queryByText('Resolve Bitcoin payment review')).not.toBeInTheDocument();
  });

  it('renders refund_required copy and hides Paid for the seller', () => {
    const payment = createPaymentFixture('manual_review', {
      adapter: 'paykit',
      reviewReason: 'refund_required',
    });
    render(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('cancelled', {
          paymentId: payment.id,
          paymentMethod: 'bitcoin',
          cancellationReason: 'payment window elapsed',
        })}
        payment={payment}
        isBuyer={false}
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );

    expect(screen.getByText(CHECKOUT_HOLD_COPY.refundRequiredBitcoinSeller)).toBeInTheDocument();
    expect(screen.queryByText(CHECKOUT_HOLD_COPY.refundRequiredBuyer)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Outcome')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Paid' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Refunded' })).toBeInTheDocument();
  });

  it('renders elapsed copy instead of the generic expired explanation', () => {
    const payment = createPaymentFixture('expired');
    render(
      <MarketplacePaymentStatusCard
        order={createOrderFixture('cancelled', {
          paymentId: payment.id,
          cancellationReason: 'payment window elapsed',
        })}
        payment={payment}
        isBuyer
        adapterMode="transaction-service"
        advancePayment={async () => false}
        onPaymentChanged={() => {}}
      />,
    );

    expect(screen.getByText(CHECKOUT_HOLD_COPY.expiredNoLateMoney)).toBeInTheDocument();
    expect(screen.queryByText(/reconciled manually/)).not.toBeInTheDocument();
  });
});
