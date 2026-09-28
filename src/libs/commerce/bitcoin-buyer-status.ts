import {
  bitcoinPaymentBreakdown,
  formatBitcoinAwareMoney,
  satoshiCount,
  type BitcoinPaymentOrder,
} from '@/libs/commerce/bitcoin-payment-code';
import { formatHoldDeadline } from '@/libs/commerce/checkout-hold';
import { buyerCheckoutStateLabel, reservedWhileYouPayCopy } from '@/libs/commerce/checkout-phase';
import type { PaymentMethodKind } from '@/libs/commerce/payment-methods';
import type { CommerceMoney } from '@/libs/commerce/transaction-contracts';

/** Buyer-facing label once a Bitcoin payment has been seen. */
export const PAYMENT_SEEN_LABEL = 'Payment seen';

export const PAYMENT_SEEN_WAITING_COPY = "Payment seen — waiting for confirmation. You don't need to do anything else.";

export const PAYMENT_CONFIRMED_REVIEW_COPY = 'Payment confirmed on-chain. The seller is reviewing it.';

export const BITCOIN_WALLET_DELIVERED_COPY =
  'Delivered to your wallet. Open Bitkit to pay. This page updates once the marketplace independently verifies the payment on-chain.';

export const BITCOIN_WALLET_WAITING_COPY =
  'Waiting for your wallet. Keep Bitkit open so it can receive the payment request.';

const SEEN_REQUEST_STATES = new Set(['detected', 'awaiting_seller_confirmation', 'confirmed']);

type BitcoinStatusOrder = {
  paymentMethod?: PaymentMethodKind | null;
  paykitRequestState?: string | null;
  paykitDeliveryState?: string | null;
  holdExpiresAt?: string | null;
  paykitSellerConfirmationDeadline?: string | null;
  subtotal?: CommerceMoney;
  shipping?: CommerceMoney;
  total?: CommerceMoney;
  merchandiseTotal?: CommerceMoney | null;
  bitcoinPayable?: CommerceMoney | null;
  paykitTotalSats?: number | null;
  bitcoinQuote?: { quotedSats: number | null } | null;
};

type BitcoinStatusPayment = {
  state?: string | null;
  reviewReason?: string | null;
} | null;

/** The service has observed the payment. The buyer must not be told to pay again. */
export function bitcoinPaymentHasBeenSeen(order: { paykitRequestState?: string | null }): boolean {
  return order.paykitRequestState != null && SEEN_REQUEST_STATES.has(order.paykitRequestState);
}

export function sellerConfirmsByCopy(deadline: string | null | undefined): string {
  const formatted = formatHoldDeadline(deadline);
  return formatted ? `Seller confirms by ${formatted}.` : PAYMENT_SEEN_LABEL;
}

/**
 * Checkout and order-list line for a buyer still in pending payment.
 * A seen payment names the seller's confirm-by time. An unseen one keeps
 * the pay-by countdown.
 */
export function buyerCheckoutProgressCopy(order: BitcoinStatusOrder, nowMs = Date.now()): string {
  if (order.paykitRequestState === 'detected' || order.paykitRequestState === 'awaiting_seller_confirmation') {
    return sellerConfirmsByCopy(order.paykitSellerConfirmationDeadline ?? order.holdExpiresAt);
  }
  if (order.paykitRequestState === 'confirmed') return PAYMENT_SEEN_LABEL;
  if (order.paymentMethod) return reservedWhileYouPayCopy(order.holdExpiresAt, nowMs);
  return buyerCheckoutStateLabel(order);
}

export function buyerCheckoutBadgeLabel(order: BitcoinStatusOrder): string {
  if (bitcoinPaymentHasBeenSeen(order)) return PAYMENT_SEEN_LABEL;
  return buyerCheckoutStateLabel(order);
}

/** Wallet instructions only while the request is still unpaid. */
export function buyerBitcoinWalletCopy(
  order: BitcoinStatusOrder,
  payment: BitcoinStatusPayment,
): { kind: 'pay'; text: string } | { kind: 'seen'; text: string } | { kind: 'review'; text: string } {
  const reviewing =
    payment?.state === 'manual_review' &&
    payment.reviewReason !== 'refund_required' &&
    (order.paykitRequestState === 'confirmed' || payment.reviewReason === 'late_settlement');
  if (reviewing || (order.paykitRequestState === 'confirmed' && payment?.state === 'manual_review')) {
    return { kind: 'review', text: PAYMENT_CONFIRMED_REVIEW_COPY };
  }
  if (order.paykitRequestState === 'detected' || order.paykitRequestState === 'awaiting_seller_confirmation') {
    return { kind: 'seen', text: PAYMENT_SEEN_WAITING_COPY };
  }
  if (payment?.state === 'detected' || payment?.state === 'confirmed' || payment?.state === 'manual_review') {
    return payment.state === 'manual_review'
      ? { kind: 'review', text: PAYMENT_CONFIRMED_REVIEW_COPY }
      : { kind: 'seen', text: PAYMENT_SEEN_WAITING_COPY };
  }
  return {
    kind: 'pay',
    text: order.paykitDeliveryState === 'delivered' ? BITCOIN_WALLET_DELIVERED_COPY : BITCOIN_WALLET_WAITING_COPY,
  };
}

export function sellerBitcoinConfirmPrompt(order: BitcoinStatusOrder): string {
  const payable = payableMoney(order);
  return payable
    ? `Confirm you received ${formatBitcoinAwareMoney(payable)}`
    : 'Confirm you received this Bitcoin payment';
}

export function sellerBitcoinDecision(
  order: BitcoinStatusOrder,
  payment: BitcoinStatusPayment,
): 'confirm' | 'resolve' | null {
  if (order.paymentMethod !== 'bitcoin') return null;
  if (payment?.state === 'manual_review') return 'resolve';
  if (order.paykitRequestState === 'awaiting_seller_confirmation') return 'confirm';
  return null;
}

function payableMoney(order: BitcoinStatusOrder): CommerceMoney | null {
  if (order.subtotal && order.shipping) {
    const breakdown = bitcoinPaymentBreakdown(order as BitcoinPaymentOrder);
    if (breakdown) return breakdown.payable;
  }
  if (order.total && satoshiCount(order.total) !== null) return order.total;
  return null;
}
