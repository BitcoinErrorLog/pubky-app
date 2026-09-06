import type { SellerPaymentConfigOwnView } from '@/libs/commerce/payment-methods';

/** Plain-language setup state shown as the status pill on each method card. */
export type PaymentMethodStatus = 'not_set_up' | 'connected' | 'needs_attention';

export const PAYMENT_METHOD_STATUS_LABELS: Record<PaymentMethodStatus, string> = {
  not_set_up: 'Not set up',
  connected: 'Connected',
  needs_attention: 'Needs attention',
};

export function derivePaypalStatus(config: SellerPaymentConfigOwnView | null): PaymentMethodStatus {
  return config?.paypalMerchantEmail ? 'connected' : 'not_set_up';
}

export function deriveStripeStatus(config: SellerPaymentConfigOwnView | null): PaymentMethodStatus {
  const hasLink = Boolean(config?.stripePaymentLink);
  const hasKey = Boolean(config?.stripeRestrictedKeySet);
  if (hasLink && hasKey) return 'connected';
  // Half-configured Stripe cannot verify payments: the link without the key
  // (or a stored key without a link) needs the seller to finish the pair.
  if (hasLink || hasKey) return 'needs_attention';
  return 'not_set_up';
}

export function deriveBitcoinStatus(args: {
  accountClaimed: boolean | null;
  locksError: string | null;
  claimError: string | null;
}): PaymentMethodStatus {
  if (args.locksError || args.claimError) return 'needs_attention';
  if (args.accountClaimed === true) return 'connected';
  return 'not_set_up';
}
