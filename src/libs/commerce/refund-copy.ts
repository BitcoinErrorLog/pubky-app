import { MARKETPLACE_FAILURE_MESSAGES } from '@/libs/commerce/failure-messages';
import { formatCommerceMoney } from '@/libs/commerce/format';
import { partialRefundLabel } from '@/libs/commerce/partial-refund';
import type { CommerceMoney } from '@/libs/commerce/transaction-contracts';

type RefundCopyOrder = {
  state: string;
  total: CommerceMoney;
  externalRefund?: { amountMinor: number; transactionId: string } | null;
  paymentReversedAt?: string | null;
  paymentReversalCancelledAt?: string | null;
  gatewayRefundReviewAt?: string | null;
  gatewayRefundUnmatched?: boolean;
};

export const REFUND_ORDER_NOTICES = {
  reversed:
    'PayPal reversed this payment after a dispute or chargeback. This order updates if PayPal cancels the reversal.',
  reversalCancelled: 'PayPal cancelled the payment reversal and returned the money to the seller.',
  refundOnHold:
    'PayPal sent a refund notice for this order that does not match its payment. It is on hold and has not changed this order.',
  refundNeedsCheck:
    'PayPal reported a refund the Shop could not apply to this order automatically. Check it in PayPal.',
} as const;

export type RefundOrderNotice = keyof typeof REFUND_ORDER_NOTICES;

export const REVERSED_ACTIVITY_TITLE = 'Payment reversed in PayPal';

/** Activity title for a `refund_recorded` row, from the order it names. Null keeps the generic label. */
export function refundActivityTitle(order: RefundCopyOrder | null | undefined): string | null {
  if (!order) return null;
  if (order.paymentReversedAt) return REVERSED_ACTIVITY_TITLE;
  return partialRefundLabel(order);
}

/** The order-card state pill for refunded orders. Null when the state is not refund-specific. */
export function refundStateLabel(order: RefundCopyOrder): string | null {
  const partial = partialRefundLabel(order);
  if (partial) return partial;
  if (order.state !== 'refunded_external') return null;
  return order.paymentReversedAt ? 'Payment reversed' : 'Refunded';
}

/** The refund amount and its reference, without claiming the Shop moved the money. */
export function refundRecordLine(order: RefundCopyOrder): string | null {
  const refund = order.externalRefund;
  if (!refund) return null;
  const partial = partialRefundLabel(order);
  const amount = partial ?? `Refunded in full (${formatCommerceMoney(order.total)})`;
  return `${amount}. Reference: ${refund.transactionId}`;
}

/** Plain lines for PayPal reversals and held refund notices, in display order. */
export function refundOrderNotices(order: RefundCopyOrder): RefundOrderNotice[] {
  const notices: RefundOrderNotice[] = [];
  if (order.paymentReversedAt) notices.push('reversed');
  else if (order.paymentReversalCancelledAt) notices.push('reversalCancelled');
  if (order.gatewayRefundUnmatched) notices.push('refundOnHold');
  if (order.gatewayRefundReviewAt) notices.push('refundNeedsCheck');
  return notices;
}

/** The revision-conflict toast, naming a refund or reversal that landed while the user acted. */
export function orderChangedMessage(before: RefundCopyOrder, after: RefundCopyOrder | null | undefined): string {
  if (!after) return MARKETPLACE_FAILURE_MESSAGES.orderChanged;
  if (after.paymentReversedAt && !before.paymentReversedAt) return MARKETPLACE_FAILURE_MESSAGES.orderReversedMeanwhile;
  if (after.state === 'refunded_external' && before.state !== 'refunded_external') {
    return MARKETPLACE_FAILURE_MESSAGES.orderRefundedMeanwhile;
  }
  if ((after.externalRefund?.amountMinor ?? 0) > (before.externalRefund?.amountMinor ?? 0)) {
    return MARKETPLACE_FAILURE_MESSAGES.orderRefundRecordedMeanwhile;
  }
  return MARKETPLACE_FAILURE_MESSAGES.orderChanged;
}
