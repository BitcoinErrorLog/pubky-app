/** Exact Shop copy for exclusive checkout holds (issue #50). */

export const PAYMENT_WINDOW_ELAPSED_REASON = 'payment window elapsed';

export const UNBOUND_BACK_CANCEL_REASON = 'Released hold before choosing a payment method.';

export const CHECKOUT_HOLD_COPY = {
  listingReserved:
    'Another buyer is currently paying for this item. If payment does not complete, it will become available again.',
  expiredNoLateMoney: 'Payment window elapsed. The item is available again.',
  lateCompleteBuyer:
    'Your payment arrived after the hold window. The item was still available, so this order is now paid.',
  lateCompleteSeller: 'A late payment completed this order. The item is sold.',
  refundRequiredBuyer:
    'Your payment arrived after another buyer took this item. This order cannot be completed. The seller must return your funds.',
  refundRequiredBitcoinSeller:
    'Return the observed bitcoin to the buyer. This marketplace cannot reverse Bitcoin. Message the buyer for a return address, send the transaction, then record it as an external refund.',
  refundRequiredPaypalSeller:
    'Refund this PayPal payment from your PayPal account. This marketplace cannot refund PayPal. Then record the refund.',
  refundRequiredStripeSeller: 'Refund this Stripe payment from your Stripe Dashboard. Then record the refund.',
  stripeRefundSubmitted: 'Refund submitted to Stripe.',
  stripeRefundRefused: 'Stripe refused the refund (this key cannot refund). Refund from the Stripe Dashboard.',
} as const;

export function formatHoldDeadline(holdExpiresAt: string | null | undefined): string | null {
  if (!holdExpiresAt) return null;
  const date = new Date(holdExpiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

export function holderUnboundCopy(holdExpiresAt: string | null | undefined): string {
  const deadline = formatHoldDeadline(holdExpiresAt);
  return deadline
    ? `The item is held for you until ${deadline}.`
    : 'The item is held for you once a payment starts.';
}

export function holderBoundCopy(holdExpiresAt: string | null | undefined): string {
  const deadline = formatHoldDeadline(holdExpiresAt);
  return deadline
    ? `Pay by ${deadline}. If the window ends, the item restocks.`
    : 'If the window ends, the item restocks.';
}

export function isLateCompletionOrder(order: { state: string; cancellationReason?: string | null }): boolean {
  return order.state === 'paid' && order.cancellationReason === PAYMENT_WINDOW_ELAPSED_REASON;
}

export function isRefundRequiredPayment(payment: { reviewReason?: string | null } | null | undefined): boolean {
  return payment?.reviewReason === 'refund_required';
}

export function isHoldExpiredNoLateMoney(
  order: { state: string; cancellationReason?: string | null },
  payment: { state: string; reviewReason?: string | null } | null | undefined,
): boolean {
  return (
    (order.state === 'cancelled' || payment?.state === 'expired') &&
    order.cancellationReason === PAYMENT_WINDOW_ELAPSED_REASON &&
    payment?.reviewReason !== 'refund_required' &&
    !isLateCompletionOrder(order)
  );
}

export function refundRequiredSellerCopy(paymentMethod: string | null | undefined): string {
  if (paymentMethod === 'paypal') return CHECKOUT_HOLD_COPY.refundRequiredPaypalSeller;
  if (paymentMethod === 'stripe') return CHECKOUT_HOLD_COPY.refundRequiredStripeSeller;
  return CHECKOUT_HOLD_COPY.refundRequiredBitcoinSeller;
}

export function refundRequiredCopyForRole(isBuyer: boolean, paymentMethod: string | null | undefined): string {
  return isBuyer ? CHECKOUT_HOLD_COPY.refundRequiredBuyer : refundRequiredSellerCopy(paymentMethod);
}
