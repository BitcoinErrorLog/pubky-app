import { MARKETPLACE_ROUTES } from '@/app/routes';
import { marketplaceConversationHref } from '@/libs/commerce/marketplace-conversation-query';
import { parseConversationAggregateId } from '@/libs/commerce/messaging-contracts';
import { MarketplaceNotificationNormalizer } from '@/pipes/marketplaceNotification/marketplaceNotification.normalizer';
import type { MarketplaceNotification } from '@/services/marketplace/marketplace';

const OFFER_TYPES = new Set<MarketplaceNotification['type']>([
  'offer_received',
  'offer_countered',
  'offer_accepted',
  'offer_rejected',
]);

/**
 * Where an Activity row goes. Order rows land on that order. Offer rows land
 * on that offer. A message row opens its thread when the aggregate is a
 * conversation id. Everything else uses the same surface as the notification
 * deep link.
 */
export function activityRowHref(type: MarketplaceNotification['type'], aggregateId: string | null): string {
  if (type === 'message_received' && aggregateId && parseConversationAggregateId(aggregateId)) {
    return marketplaceConversationHref(aggregateId);
  }
  if (OFFER_TYPES.has(type) && aggregateId?.startsWith('offer:')) {
    const offerId = aggregateId.slice('offer:'.length);
    return offerId ? `${MARKETPLACE_ROUTES.OFFERS}#offer-${offerId}` : MARKETPLACE_ROUTES.OFFERS;
  }
  const base = MarketplaceNotificationNormalizer.toDeepLink(type, aggregateId ?? '');
  if (base === MARKETPLACE_ROUTES.ORDERS && aggregateId?.startsWith('order:')) {
    const orderId = aggregateId.slice('order:'.length);
    return orderId ? `${MARKETPLACE_ROUTES.ORDERS}#order-${encodeURIComponent(orderId)}` : base;
  }
  return base;
}

export function orderAnchorId(orderId: string): string {
  return `order-${orderId}`;
}

/** `#order-<id>` from an activity row. Other hashes stay with checkout. */
export function readOrderAnchorId(hash: string): string | null {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!value.startsWith('order-')) return null;
  const id = decodeURIComponent(value.slice('order-'.length)).trim();
  return id.length > 0 ? id : null;
}

/**
 * The service emits one type, `return_updated`, for request, approval, and
 * receipt. The reason lives on the order. Chronological order of the rows
 * for that order is the only way to say which step a historical row was.
 */
export function returnActivityTitle(index: number, reason: string | null): string {
  if (index <= 0) {
    const trimmed = reason?.trim() ?? '';
    return trimmed.length > 0 ? `Return requested — ${trimmed}` : 'Return requested';
  }
  if (index === 1) return 'Return approved';
  return 'Return received';
}

export function returnActivityTitles(
  events: readonly { id: string; aggregateId: string; createdAt: string }[],
  reasonsByOrderId: ReadonlyMap<string, string | null>,
  ordersLoaded: boolean,
): Map<string, string> {
  const grouped = new Map<string, { id: string; createdAt: string }[]>();
  for (const event of events) {
    const orderId = event.aggregateId.startsWith('order:') ? event.aggregateId.slice('order:'.length) : '';
    const list = grouped.get(orderId) ?? [];
    list.push({ id: event.id, createdAt: event.createdAt });
    grouped.set(orderId, list);
  }
  const titles = new Map<string, string>();
  for (const [orderId, list] of grouped) {
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const known = ordersLoaded && reasonsByOrderId.has(orderId);
    sorted.forEach((event, index) => {
      titles.set(
        event.id,
        known ? returnActivityTitle(index, reasonsByOrderId.get(orderId) ?? null) : 'Return updated',
      );
    });
  }
  return titles;
}
