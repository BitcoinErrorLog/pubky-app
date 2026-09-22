import { MARKETPLACE_ROUTES } from '@/app/routes';
import { UNBOUND_BACK_CANCEL_REASON } from '@/libs/commerce/checkout-hold';
import type { PaymentMethodKind } from '@/libs/commerce/payment-methods';

export const CHECKOUT_IN_PROGRESS_LABEL = 'Checkout in progress';
export const RESERVED_WHILE_YOU_PAY_LABEL = 'Reserved while you pay';
export const BIND_FAIL_CANCEL_REASON = UNBOUND_BACK_CANCEL_REASON;

const PAID_OR_LATER_STATES = new Set([
  'paid',
  'processing',
  'shipped',
  'delivered',
  'completed',
  'ready_for_pickup',
  'refunded_external',
  'closed',
]);

export function getMarketplaceCheckoutRoute(orderId?: string | null): string {
  return orderId ? `${MARKETPLACE_ROUTES.CHECKOUT}#${orderId}` : MARKETPLACE_ROUTES.CHECKOUT;
}

export function isPendingPaymentState(state: string): boolean {
  return state === 'pending_payment';
}

export function isPaidOrLaterState(state: string): boolean {
  return PAID_OR_LATER_STATES.has(state);
}

/** Buyer history = paid and later. Cancelled unpaid checkouts are not Orders. */
export function isBuyerOrderHistory(order: { state: string; buyerPubky: string }, buyerPubky: string | null): boolean {
  return buyerPubky !== null && order.buyerPubky === buyerPubky && isPaidOrLaterState(order.state);
}

export function isAbandonedCheckout(order: { state: string; buyerPubky: string }, buyerPubky: string | null): boolean {
  return buyerPubky !== null && order.buyerPubky === buyerPubky && order.state === 'cancelled';
}

/** Seller unpaid hold — Shop has no `stock_held` field, so pending_payment is the reservation. */
export function isSellerReservation(
  order: { state: string; sellerPubky: string; buyerPubky: string },
  currentUserPubky: string | null,
): boolean {
  return (
    currentUserPubky !== null &&
    order.sellerPubky === currentUserPubky &&
    order.buyerPubky !== currentUserPubky &&
    isPendingPaymentState(order.state)
  );
}

export function isSellerPaidOrder(
  order: { state: string; sellerPubky: string; buyerPubky: string },
  currentUserPubky: string | null,
): boolean {
  return (
    currentUserPubky !== null &&
    order.sellerPubky === currentUserPubky &&
    order.buyerPubky !== currentUserPubky &&
    isPaidOrLaterState(order.state)
  );
}

export function isBuyerCheckoutInProgress(
  order: { state: string; buyerPubky: string },
  buyerPubky: string | null,
): boolean {
  return buyerPubky !== null && order.buyerPubky === buyerPubky && isPendingPaymentState(order.state);
}

export function buyerCheckoutStateLabel(order: { paymentMethod?: PaymentMethodKind | null }): string {
  return order.paymentMethod ? RESERVED_WHILE_YOU_PAY_LABEL : CHECKOUT_IN_PROGRESS_LABEL;
}

export function formatRemainingMmSs(holdExpiresAt: string | null | undefined, nowMs = Date.now()): string | null {
  if (!holdExpiresAt) return null;
  const expires = Date.parse(holdExpiresAt);
  if (!Number.isFinite(expires)) return null;
  const remainingMs = Math.max(0, expires - nowMs);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function reservedWhileYouPayCopy(holdExpiresAt: string | null | undefined, nowMs = Date.now()): string {
  const remaining = formatRemainingMmSs(holdExpiresAt, nowMs);
  return remaining ? `${RESERVED_WHILE_YOU_PAY_LABEL} · ${remaining}` : RESERVED_WHILE_YOU_PAY_LABEL;
}

export function sellerReservationCopy(holdExpiresAt: string | null | undefined): string {
  if (!holdExpiresAt) return 'Held for a buyer.';
  const restock = new Date(holdExpiresAt);
  if (Number.isNaN(restock.getTime())) return 'Held for a buyer.';
  const time = restock.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Held for a buyer · restocks ${time}`;
}

export function extractCheckoutOrderIds(result: unknown): string[] {
  if (!result || typeof result !== 'object') return [];
  const orders = (result as { orders?: unknown }).orders;
  if (!Array.isArray(orders)) return [];
  return orders.flatMap((order) => {
    if (!order || typeof order !== 'object' || !('id' in order)) return [];
    return typeof order.id === 'string' && order.id.length > 0 ? [order.id] : [];
  });
}

export function listingAggregatesFromCheckoutLines(lines: Array<{ listingAggregateId?: string }>): string[] {
  return lines.flatMap((line) => (line.listingAggregateId ? [line.listingAggregateId] : []));
}

const PAYMENT_METHOD_ORDER: PaymentMethodKind[] = ['bitcoin', 'stripe', 'paypal'];

/** Shared rails across every seller in a cart. Empty means Pay stays disabled. */
export function intersectPaymentMethods(sets: PaymentMethodKind[][]): PaymentMethodKind[] {
  if (sets.length === 0) return [];
  return PAYMENT_METHOD_ORDER.filter((method) => sets.every((set) => set.includes(method)));
}

export function readCheckoutHashOrderId(hash = ''): string | null {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveCreatedCheckoutOrderIds(input: {
  result: unknown;
  orders: Array<{
    id: string;
    state: string;
    buyerPubky: string;
    lines: Array<{ listingAggregateId: string }>;
  }>;
  listingAggregateIds: string[];
  buyerPubky: string | null;
}): string[] {
  const fromResult = extractCheckoutOrderIds(input.result);
  if (fromResult.length > 0) return fromResult;
  if (!input.buyerPubky) return [];
  const wanted = new Set(input.listingAggregateIds);
  return input.orders
    .filter(
      (order) =>
        isBuyerCheckoutInProgress(order, input.buyerPubky) &&
        order.lines.some((line) => wanted.has(line.listingAggregateId)),
    )
    .map((order) => order.id);
}
