import type { MarketplaceNotification } from '@/services/marketplace/marketplace';

/**
 * Notification `type` strings pubky-marketplace-service writes.
 * Extracted from `insert_notification_intent` literals, `finish_order_action`
 * `(type, recipient)` tuples, and `notify_paid_buyers` on
 * BitcoinErrorLog/pubky-marketplace-service `origin/main`
 * `947f5574ef38c3eb4e5c9bc2e73fef3d17b12fc7`, plus the PayPal refund
 * notification `finish` in `payment_methods/paypal_refund.rs` at
 * `94ecb0d11b16808dd56e475e5308953f85a561f7`.
 *
 * Shop-only types (`message_received`, `order_cancelled_terms_change`) are
 * mapped too, but they are not in this list because that service revision
 * does not emit them.
 */
export const SERVICE_NOTIFICATION_TYPES = [
  'auction_ended',
  'auction_won',
  'bitcoin_manual_review',
  'bitcoin_prepare_voided',
  'drop_sold_out',
  'fiat_payment_reported',
  'offer_accepted',
  'offer_countered',
  'offer_received',
  'offer_rejected',
  'order_cancelled',
  'order_completed',
  'order_created',
  'order_delivered',
  'order_delivery_assumed',
  'order_shipped',
  'outbid',
  'payment_confirmed',
  'payment_method_bound',
  'payment_refund_required',
  'payment_reversal_cancelled',
  'pickup_details_cleared',
  'pickup_details_updated',
  'pickup_ready',
  'refund_recorded',
  'return_updated',
  'review_received',
] as const;

export type ServiceNotificationType = (typeof SERVICE_NOTIFICATION_TYPES)[number];

const SERVICE_NOTIFICATION_TYPE_SET: ReadonlySet<string> = new Set(SERVICE_NOTIFICATION_TYPES);

export function isServiceNotificationType(type: string): type is ServiceNotificationType {
  return SERVICE_NOTIFICATION_TYPE_SET.has(type);
}

/** Plain activity-row titles. One sentence of what happened, no diagnostics. */
export const MARKETPLACE_ACTIVITY_LABELS = {
  message_received: 'New marketplace message',
  offer_received: 'New offer received',
  offer_countered: 'Offer countered',
  offer_accepted: 'Offer accepted',
  offer_rejected: 'Offer declined',
  outbid: 'You were outbid',
  auction_won: 'You won the auction',
  auction_ended: 'Auction ended',
  order_created: 'Checkout started',
  payment_method_bound: 'Payment method connected',
  fiat_payment_reported: 'Payment reported',
  payment_confirmed: 'Payment confirmed',
  bitcoin_manual_review: 'Bitcoin payment needs a decision',
  bitcoin_prepare_voided: 'Bitcoin payment expired',
  order_cancelled: 'Order cancelled',
  order_cancelled_terms_change: 'Order cancelled — pickup terms changed',
  order_shipped: 'Order shipped',
  order_delivery_assumed: 'Delivery marked automatically',
  order_delivered: 'Delivery confirmed',
  order_completed: 'Order completed',
  return_updated: 'Return updated',
  refund_recorded: 'Refund recorded',
  review_received: 'New review received',
  pickup_details_updated: 'Pickup details updated',
  pickup_details_cleared: 'Pickup details removed',
  pickup_ready: 'Order ready for pickup',
  payment_refund_required: 'Payment requires a refund',
  drop_sold_out: 'Drop sold out',
  payment_reversal_cancelled: 'Disputed payment restored',
} as const satisfies Record<MarketplaceNotification['type'], string>;

/**
 * How an `order_delivered` notification about a digital order came about
 * (digital delivery design §3 "After payment"): `automatic` when payment
 * confirmation released an all-instant order (the confirming system,
 * PayPal, or the buyer's own sandbox advance is the actor), `manual` when
 * the seller marked it emailed or delivered. Null for every other
 * notification, including a shipped or picked-up `order_delivered`, which
 * only ever reaches the seller.
 */
export type DigitalDeliveryNotice = 'automatic' | 'manual';

export function digitalDeliveryNotice(notification: {
  type: string;
  actorPubky: string;
  recipientPubky: string;
  orderFulfillment?: string | null;
}): DigitalDeliveryNotice | null {
  if (notification.type !== 'order_delivered' || notification.orderFulfillment !== 'digital') return null;
  const { actorPubky, recipientPubky } = notification;
  return actorPubky === 'system' || actorPubky === 'paypal-ipn' || actorPubky === recipientPubky
    ? 'automatic'
    : 'manual';
}

/** The digital wording of `order_delivered`: the activity title and the feed's "<actor> <action>". Never names the delivery email. */
export const DIGITAL_DELIVERED_COPY = {
  automatic: {
    label: 'Purchase ready to download',
    action: 'confirmed your payment. Your purchase is ready to download',
  },
  manual: {
    label: 'Purchase delivered',
    action: 'delivered your purchase',
  },
} as const satisfies Record<DigitalDeliveryNotice, { label: string; action: string }>;

export function marketplaceActivityLabel(type: string): string | null {
  if (Object.hasOwn(MARKETPLACE_ACTIVITY_LABELS, type)) {
    return MARKETPLACE_ACTIVITY_LABELS[type as MarketplaceNotification['type']];
  }
  return null;
}

/**
 * The incomplete-history banner is for a type the Shop has no copy for.
 * A service type that is known, even when the row failed a later schema
 * check, is ordinary history.
 */
export function isIntegrityGapActivityType(type: string): boolean {
  return marketplaceActivityLabel(type) === null;
}
