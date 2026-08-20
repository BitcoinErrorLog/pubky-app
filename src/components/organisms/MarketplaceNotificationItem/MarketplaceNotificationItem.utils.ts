import type { MarketplaceFeedNotification } from '@/pipes/marketplaceNotification/marketplaceNotification.types';

/**
 * Action text rendered after the actor's username, mirroring the social
 * rows' "<username> <action>" grammar. Phrasing stays mechanical — it only
 * claims what the notification type itself asserts, because the redacted
 * payload (type, actor, aggregate reference, timestamp) carries nothing to
 * elaborate with. Exhaustive: adding a notification type fails compilation.
 */
export function getMarketplaceNotificationActionText(type: MarketplaceFeedNotification['type']): string {
  switch (type) {
    case 'message_received':
      return 'sent you a marketplace message';
    case 'offer_received':
      return 'sent you an offer';
    case 'offer_countered':
      return 'countered an offer';
    case 'offer_accepted':
      return 'accepted an offer';
    case 'offer_rejected':
      return 'declined an offer';
    case 'outbid':
      return 'outbid you in an auction';
    case 'auction_won':
      return 'closed an auction you won';
    case 'auction_ended':
      return 'ended an auction';
    case 'order_created':
      return 'placed an order';
    case 'payment_confirmed':
      return 'paid for an order';
    case 'order_cancelled':
      return 'updated an order cancellation';
    case 'order_shipped':
      return 'shipped your order';
    case 'order_delivered':
      return 'confirmed delivery of an order';
    case 'return_updated':
      return 'updated a return';
    case 'refund_recorded':
      return 'recorded a refund';
    case 'dispute_updated':
      return 'updated a dispute';
    case 'review_received':
      return 'left you a review';
  }
}
