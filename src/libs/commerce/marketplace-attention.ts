import type { MarketplaceNotification } from '@/services/marketplace/marketplace';

/**
 * Activity rows that still need the person who received them. Informational
 * rows (payment confirmed, shipped, completed) stay in the history and do
 * not badge.
 */
const ACTION_ACTIVITY_TYPES = new Set<MarketplaceNotification['type']>([
  'message_received',
  'offer_received',
  'offer_countered',
  'return_updated',
  'pickup_ready',
  'payment_refund_required',
  'bitcoin_manual_review',
]);

export function isMarketplaceActionActivity(type: MarketplaceNotification['type']): boolean {
  return ACTION_ACTIVITY_TYPES.has(type);
}

const ORDERS_SEEN_PREFIX = 'pubky.marketplace.ordersSeen.';

export const MARKETPLACE_ORDERS_SEEN_EVENT = 'marketplace-orders-seen';

export function readOrdersSeenAt(pubky: string, storage: Pick<Storage, 'getItem'>): number {
  const raw = storage.getItem(`${ORDERS_SEEN_PREFIX}${pubky}`);
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Moves the per-identity orders checkpoint forward. Never backward. */
export function writeOrdersSeenAt(pubky: string, at: number, storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  const current = readOrdersSeenAt(pubky, storage);
  if (!(at > current)) return false;
  storage.setItem(`${ORDERS_SEEN_PREFIX}${pubky}`, String(at));
  return true;
}

export function markOrdersAttentionSeen(pubky: string, at = Date.now()): void {
  if (typeof window === 'undefined') return;
  if (!writeOrdersSeenAt(pubky, at, window.localStorage)) return;
  window.dispatchEvent(new Event(MARKETPLACE_ORDERS_SEEN_EVENT));
}

type AttentionOrder = {
  nextActor: 'buyer' | 'seller' | 'none';
  buyerPubky: string;
  sellerPubky: string;
  updatedAt: string;
};

export function orderNeedsCurrentUser(order: AttentionOrder, currentUserPubky: string | null): boolean {
  if (currentUserPubky === null) return false;
  if (order.nextActor === 'buyer') return order.buyerPubky === currentUserPubky;
  if (order.nextActor === 'seller') return order.sellerPubky === currentUserPubky;
  return false;
}

/**
 * Orders whose next move is this identity, newer than the last time this
 * browser opened Orders for them. A missing timestamp still counts when the
 * tab has never been opened.
 */
export function marketplaceNavAccessibleName(cartCount: number, attentionCount: number): string {
  const attention = attentionCount === 1 ? '1 needs attention' : `${attentionCount} need attention`;
  if (cartCount <= 0) return `Marketplace, ${attention}`;
  const cart = cartCount === 1 ? '1 item in cart' : `${cartCount} items in cart`;
  return `Marketplace, ${cart}, ${attention}`;
}

export function countOrdersNeedingAttention(
  orders: readonly AttentionOrder[],
  currentUserPubky: string,
  seenAt: number,
): number {
  return orders.filter((order) => {
    if (!orderNeedsCurrentUser(order, currentUserPubky)) return false;
    const updated = Date.parse(order.updatedAt);
    if (!Number.isFinite(updated)) return seenAt === 0;
    return updated > seenAt;
  }).length;
}
