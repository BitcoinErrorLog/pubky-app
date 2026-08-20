import type { MarketplaceOrder, MarketplacePayment, MarketplaceReceipt } from '@/services/marketplace/marketplace';

export const ORDER_FIXTURE_BUYER = 'b'.repeat(52);
export const ORDER_FIXTURE_SELLER = 's'.repeat(52);

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD', exponent: 2 });

/**
 * Every order state the transaction contract defines, so each one has a
 * rendered VRT baseline instead of only the states a happy path reaches.
 */
export const ORDER_STATES = [
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'completed',
  'cancel_requested',
  'cancelled',
  'return_requested',
  'return_approved',
  'return_received',
  'disputed',
  'refunded_external',
  'closed',
] as const satisfies readonly MarketplaceOrder['state'][];

/** Every buyer-visible payment state, including the ones only reachable by timeout or reconciliation. */
export const PAYMENT_STATES = [
  'awaiting_entitlement',
  'detected',
  'confirmed',
  'expired',
  'manual_review',
] as const satisfies readonly MarketplacePayment['state'][];

function uuid(seed: number): string {
  const hex = seed.toString(16).padStart(12, '0');
  return `018f47d2-6a27-7c23-a49d-${hex}`;
}

export function createOrderFixture(
  state: MarketplaceOrder['state'],
  overrides: Partial<MarketplaceOrder> = {},
): MarketplaceOrder {
  const stateIndex = ORDER_STATES.indexOf(state) + 1;
  const isShipped = state === 'shipped' || state === 'delivered' || state === 'completed' || state === 'closed';
  const isReturning = state === 'return_requested' || state === 'return_approved' || state === 'return_received';

  return {
    id: uuid(stateIndex),
    buyerPubky: ORDER_FIXTURE_BUYER,
    sellerPubky: ORDER_FIXTURE_SELLER,
    revision: stateIndex,
    state,
    lines: [
      {
        listingAggregateId: `listing:${ORDER_FIXTURE_SELLER}_boots`,
        listingRevision: 2,
        contentHash: 'a'.repeat(64),
        title: 'Handmade leather boots',
        quantity: 1,
        unitPrice: usd(12_500),
        subtotal: usd(12_500),
      },
    ],
    subtotal: usd(12_500),
    shipping: usd(1_200),
    tax: usd(1_096),
    total: usd(14_796),
    guaranteePolicyVersion: 1,
    paymentId: uuid(100 + stateIndex),
    receiptId: state === 'pending_payment' ? null : uuid(200 + stateIndex),
    cancellationReason: state === 'cancelled' ? 'Buyer cancelled before handling' : null,
    shipment: isShipped
      ? {
          carrier: 'Local Courier',
          trackingNumber: 'LC-4417-8890',
          state: state === 'shipped' ? 'shipped' : 'delivered',
          shippedAt: '2026-08-14T10:00:00.000Z',
          deliveredAt: state === 'shipped' ? null : '2026-08-17T14:30:00.000Z',
        }
      : null,
    returnRequest: isReturning
      ? {
          state: state === 'return_requested' ? 'requested' : state === 'return_approved' ? 'approved' : 'received',
          reason: 'Item does not match the described condition',
          requestedAmountMinor: 14_796,
          requestedAt: '2026-08-18T09:00:00.000Z',
          updatedAt: '2026-08-19T09:00:00.000Z',
        }
      : null,
    externalRefund:
      state === 'refunded_external'
        ? { amountMinor: 14_796, transactionId: 'f'.repeat(64), recordedAt: '2026-08-19T18:00:00.000Z' }
        : null,
    dispute:
      state === 'disputed'
        ? {
            state: 'open' as const,
            openedBy: ORDER_FIXTURE_BUYER,
            reason: 'Seller stopped responding after delivery exception',
            requestedRemedy: 'refund' as const,
            resolution: null,
            rationale: null,
            openedAt: '2026-08-19T12:00:00.000Z',
            resolvedAt: null,
          }
        : null,
    createdAt: '2026-08-12T08:00:00.000Z',
    updatedAt: '2026-08-19T20:00:00.000Z',
    ...overrides,
  };
}

export function createPaymentFixture(
  state: MarketplacePayment['state'],
  overrides: Partial<MarketplacePayment> = {},
): MarketplacePayment {
  const stateIndex = PAYMENT_STATES.indexOf(state) + 1;
  return {
    id: uuid(300 + stateIndex),
    orderId: uuid(stateIndex),
    buyerPubky: ORDER_FIXTURE_BUYER,
    sellerPubky: ORDER_FIXTURE_SELLER,
    revision: stateIndex,
    adapter: 'sandbox',
    state,
    confirmations: state === 'confirmed' ? 6 : state === 'detected' ? 0 : 0,
    locksBundleId: uuid(400 + stateIndex),
    amount: usd(14_796),
    createdAt: '2026-08-12T08:00:00.000Z',
    updatedAt: '2026-08-19T20:00:00.000Z',
    ...overrides,
  };
}

export function createReceiptFixture(overrides: Partial<MarketplaceReceipt> = {}): MarketplaceReceipt {
  return {
    id: uuid(500),
    orderId: uuid(2),
    paymentId: uuid(302),
    issuerPubky: ORDER_FIXTURE_SELLER,
    recipientPubky: ORDER_FIXTURE_BUYER,
    total: usd(14_796),
    contentHash: 'c'.repeat(64),
    issuedAt: '2026-08-13T09:00:00.000Z',
    ...overrides,
  };
}

/** One order view per order state, each paired with a plausible payment for that stage. */
export function createOrderViewsForEveryState() {
  return ORDER_STATES.map((state) => ({
    order: createOrderFixture(state),
    payment: createPaymentFixture(state === 'pending_payment' ? 'awaiting_entitlement' : 'confirmed'),
    receipt: state === 'pending_payment' ? null : createReceiptFixture(),
  }));
}

/** One order view per payment state, so every payment label has a baseline. */
export function createOrderViewsForEveryPaymentState() {
  return PAYMENT_STATES.map((state) => ({
    order: createOrderFixture(state === 'confirmed' ? 'paid' : 'pending_payment'),
    payment: createPaymentFixture(state),
    receipt: null,
  }));
}
