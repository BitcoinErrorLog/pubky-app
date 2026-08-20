import { createHash, randomUUID } from 'node:crypto';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { commercePubkySchema } from '../../../src/libs/commerce/transaction-contracts';
import {
  type AcceptOfferCommand,
  type AdvanceSandboxPaymentCommand,
  type ApproveOrderCancellationCommand,
  type ApproveReturnCommand,
  buildMarketplaceCheckoutAggregateId,
  buildMarketplaceConversationAggregateId,
  buildMarketplaceListingAggregateId,
  buildMarketplaceOfferAggregateId,
  buildMarketplaceOrderAggregateId,
  buildMarketplacePaymentAggregateId,
  type CloseAuctionCommand,
  type ConfirmOrderDeliveryCommand,
  type CounterOfferCommand,
  type CreateMarketplaceCheckoutCommand,
  type CreateMarketplaceReportCommand,
  type CreateOfferCommand,
  type CreateReviewCommand,
  type MarketplaceCommand,
  marketplaceCommandSchema,
  type MarkMarketplaceNotificationReadCommand,
  type OpenDisputeCommand,
  type PlaceBidCommand,
  type ReceiveReturnCommand,
  type RecordExternalRefundCommand,
  type RegisterListingCommand,
  type RejectOfferCommand,
  type RequestOrderCancellationCommand,
  type RequestReturnCommand,
  type ReserveInventoryCommand,
  type ResolveDisputeCommand,
  type SendMarketplaceMessageCommand,
  type ShipOrderCommand,
  type UpdateMarketplaceNotificationPreferencesCommand,
  type WithdrawOfferCommand,
} from './contracts';

export interface MarketplaceListingAggregate {
  aggregateId: string;
  sellerPubky: string;
  listingId: string;
  title: string;
  listingRevision: number;
  contentHash: string;
  serverRevision: number;
  state: 'available' | 'reserved' | 'sold';
  totalQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  soldQuantity: number;
  unitPrice: {
    amountMinor: number;
    currency: string;
    exponent: number;
  };
  saleFormat: 'fixed_price' | 'auction';
  auction: {
    status: 'scheduled' | 'active' | 'sold' | 'unsold' | 'cancelled';
    startsAt: string;
    endsAt: string;
    minimumIncrement: MarketplaceListingAggregate['unitPrice'];
    reservePrice?: MarketplaceListingAggregate['unitPrice'];
    antiSnipingWindowSeconds: number;
    antiSnipingExtensionSeconds: number;
    currentPrice: MarketplaceListingAggregate['unitPrice'];
    leaderPubky: string | null;
    bidCount: number;
    reserveMet: boolean;
  } | null;
  updatedAt: string;
}

export interface MarketplaceReservation {
  id: string;
  aggregateId: string;
  buyerPubky: string;
  quantity: number;
  status: 'active';
  expiresAt: string;
  createdAt: string;
}

export interface MarketplaceOfferHistoryEntry {
  revision: number;
  actorPubky: string;
  action: 'created' | 'countered' | 'accepted' | 'rejected' | 'withdrawn';
  amount: MarketplaceListingAggregate['unitPrice'];
  quantity: number;
  message: string;
  occurredAt: string;
}

export interface MarketplaceOffer {
  id: string;
  aggregateId: string;
  listingAggregateId: string;
  buyerPubky: string;
  sellerPubky: string;
  revision: number;
  state: 'pending' | 'countered' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
  offeredBy: string;
  amount: MarketplaceListingAggregate['unitPrice'];
  quantity: number;
  message: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  history: MarketplaceOfferHistoryEntry[];
}

export interface MarketplaceBid {
  id: string;
  listingAggregateId: string;
  bidderPubky: string;
  maximumAmount: MarketplaceListingAggregate['unitPrice'];
  sequence: number;
  createdAt: string;
}

export interface MarketplaceAttachmentMetadata {
  id: string;
  senderPubky: string;
  recipientPubky: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
  contentHash: string;
  createdAt: string;
}

interface MarketplaceStoredAttachment extends MarketplaceAttachmentMetadata {
  bytes: Uint8Array;
  messageId: string | null;
}

export interface MarketplaceMessage {
  id: string;
  conversationId: string;
  listingAggregateId: string;
  senderPubky: string;
  recipientPubky: string;
  text: string;
  attachments: MarketplaceAttachmentMetadata[];
  createdAt: string;
}

export interface MarketplaceConversation {
  id: string;
  listingAggregateId: string;
  sellerPubky: string;
  buyerPubky: string;
  revision: number;
  lastMessageAt: string;
  messages: MarketplaceMessage[];
}

export interface MarketplaceNotification {
  id: string;
  revision: number;
  recipientPubky: string;
  actorPubky: string;
  type:
    | 'message_received'
    | 'offer_received'
    | 'offer_countered'
    | 'offer_accepted'
    | 'offer_rejected'
    | 'outbid'
    | 'auction_won'
    | 'auction_ended'
    | 'order_created'
    | 'payment_confirmed'
    | 'order_cancelled'
    | 'order_shipped'
    | 'order_delivered'
    | 'return_updated'
    | 'refund_recorded'
    | 'dispute_updated'
    | 'review_received';
  aggregateId: string;
  createdAt: string;
  readAt: string | null;
}

export interface MarketplaceNotificationPreferences {
  ownerPubky: string;
  revision: number;
  messages: boolean;
  offers: boolean;
  bids: boolean;
  auctions: boolean;
  updatedAt: string;
}

export interface MarketplaceOrderLine {
  listingAggregateId: string;
  listingRevision: number;
  contentHash: string;
  title: string;
  quantity: number;
  unitPrice: MarketplaceListingAggregate['unitPrice'];
  subtotal: MarketplaceListingAggregate['unitPrice'];
}

export interface MarketplaceDeliveryAddress {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
}

export interface MarketplaceShipment {
  carrier: string;
  trackingNumber: string;
  state: 'shipped' | 'delivered';
  shippedAt: string;
  deliveredAt: string | null;
}

export interface MarketplaceReturn {
  state: 'requested' | 'approved' | 'received' | 'refunded';
  reason: string;
  requestedAmountMinor: number;
  requestedAt: string;
  updatedAt: string;
}

export interface MarketplaceDispute {
  state: 'open' | 'resolved';
  openedBy: string;
  reason: string;
  requestedRemedy: 'refund' | 'partial_refund' | 'replacement' | 'other';
  resolution: 'buyer_refund' | 'partial_refund' | 'seller_favor' | 'replacement' | null;
  rationale: string | null;
  openedAt: string;
  resolvedAt: string | null;
}

export interface MarketplaceReview {
  id: string;
  reviewerPubky: string;
  subjectPubky: string;
  rating: number;
  text: string;
  createdAt: string;
}

export interface MarketplaceExternalRefund {
  amountMinor: number;
  transactionId: string;
  recordedAt: string;
}

export interface MarketplaceReport {
  id: string;
  reporterPubky: string;
  targetType: 'listing' | 'user' | 'message' | 'review';
  targetId: string;
  reason: 'prohibited_item' | 'counterfeit' | 'scam' | 'harassment' | 'unsafe' | 'other';
  details: string;
  state: 'open';
  createdAt: string;
}

export interface MarketplaceOrder {
  id: string;
  buyerPubky: string;
  sellerPubky: string;
  revision: number;
  state:
    | 'pending_payment'
    | 'paid'
    | 'processing'
    | 'shipped'
    | 'delivered'
    | 'completed'
    | 'cancel_requested'
    | 'cancelled'
    | 'return_requested'
    | 'return_approved'
    | 'return_received'
    | 'disputed'
    | 'refunded_external'
    | 'closed';
  lines: MarketplaceOrderLine[];
  deliveryAddress: MarketplaceDeliveryAddress;
  subtotal: MarketplaceListingAggregate['unitPrice'];
  shipping: MarketplaceListingAggregate['unitPrice'];
  tax: MarketplaceListingAggregate['unitPrice'];
  total: MarketplaceListingAggregate['unitPrice'];
  guaranteePolicyVersion: 1;
  paymentId: string;
  receiptId: string | null;
  cancellationReason: string | null;
  shipment: MarketplaceShipment | null;
  returnRequest: MarketplaceReturn | null;
  dispute: MarketplaceDispute | null;
  externalRefund: MarketplaceExternalRefund | null;
  reviews: MarketplaceReview[];
  createdAt: string;
  updatedAt: string;
}

export interface MarketplacePayment {
  id: string;
  orderId: string;
  buyerPubky: string;
  sellerPubky: string;
  revision: number;
  adapter: 'sandbox';
  state: 'awaiting_entitlement' | 'detected' | 'confirmed' | 'expired' | 'manual_review';
  confirmations: number;
  locksBundleId: string;
  amount: MarketplaceListingAggregate['unitPrice'];
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceReceipt {
  id: string;
  orderId: string;
  paymentId: string;
  issuerPubky: string;
  recipientPubky: string;
  total: MarketplaceListingAggregate['unitPrice'];
  contentHash: string;
  issuedAt: string;
}

export interface MarketplaceEvent {
  id: string;
  commandId: string;
  aggregateId: string;
  revision: number;
  actorPubky: string;
  kind:
    | 'listing.registered'
    | 'inventory.reserved'
    | 'offer.created'
    | 'offer.countered'
    | 'offer.accepted'
    | 'offer.rejected'
    | 'offer.withdrawn'
    | 'auction.bid_placed'
    | 'message.sent'
    | 'auction.closed_sold'
    | 'auction.closed_unsold'
    | 'notification.read'
    | 'notification.preferences_updated'
    | 'order.created'
    | 'payment.detected'
    | 'payment.confirmed'
    | 'payment.expired'
    | 'payment.manual_review'
    | 'receipt.issued'
    | 'order.cancel_requested'
    | 'order.cancelled'
    | 'fulfillment.shipped'
    | 'fulfillment.delivered'
    | 'return.requested'
    | 'return.approved'
    | 'return.received'
    | 'refund.recorded_external'
    | 'dispute.opened'
    | 'dispute.resolved'
    | 'review.created'
    | 'trust.reported';
  occurredAt: string;
}

export type MarketplaceCommandSuccess = {
  ok: true;
  version: 1;
  commandId: string;
  aggregateId: string;
  revision: number;
  eventIds: string[];
  result:
    | { kind: 'listing'; listing: MarketplaceListingAggregate }
    | { kind: 'reservation'; listing: MarketplaceListingAggregate; reservation: MarketplaceReservation }
    | { kind: 'offer'; offer: MarketplaceOffer }
    | {
        kind: 'bid';
        listing: MarketplaceListingAggregate;
        bid: MarketplaceBid;
      }
    | {
        kind: 'message';
        conversation: MarketplaceConversation;
        message: MarketplaceMessage;
      }
    | {
        kind: 'accepted_offer';
        offer: MarketplaceOffer;
        listing: MarketplaceListingAggregate;
        reservation: MarketplaceReservation;
      }
    | {
        kind: 'auction_result';
        outcome: 'sold' | 'unsold';
        winnerPubky: string | null;
        listing: MarketplaceListingAggregate;
        reservation: MarketplaceReservation | null;
      }
    | { kind: 'notification'; notification: MarketplaceNotification }
    | { kind: 'notification_preferences'; preferences: MarketplaceNotificationPreferences }
    | { kind: 'checkout'; orders: MarketplaceOrder[]; payments: MarketplacePayment[] }
    | {
        kind: 'payment';
        payment: MarketplacePayment;
        order: MarketplaceOrder;
        receipt: MarketplaceReceipt | null;
      }
    | { kind: 'order'; order: MarketplaceOrder }
    | { kind: 'review'; order: MarketplaceOrder; review: MarketplaceReview }
    | { kind: 'report'; report: MarketplaceReport };
};

export type MarketplaceCommandFailure = {
  ok: false;
  error: {
    code:
      | 'INVALID_COMMAND'
      | 'UNAUTHORIZED'
      | 'NOT_FOUND'
      | 'REVISION_CONFLICT'
      | 'IDEMPOTENCY_CONFLICT'
      | 'INSUFFICIENT_INVENTORY'
      | 'INVARIANT_VIOLATION'
      | 'OFFER_EXPIRED'
      | 'INVALID_STATE'
      | 'AUCTION_CLOSED'
      | 'BID_TOO_LOW';
    message: string;
    currentRevision?: number;
    issues?: Array<{ path: string; message: string }>;
  };
};

export type MarketplaceCommandResult = MarketplaceCommandSuccess | MarketplaceCommandFailure;

export type MarketplaceAttachmentStoreResult =
  | { ok: true; attachment: MarketplaceAttachmentMetadata }
  | { ok: false; code: 'INVALID_ATTACHMENT' | 'UNAUTHORIZED'; message: string };

export const MARKETPLACE_SANDBOX_MODERATOR = 'm'.repeat(52);

type StoredCommand = {
  requestHash: string;
  result: MarketplaceCommandSuccess;
};

export class InMemoryMarketplaceRepository {
  private listings = new Map<string, MarketplaceListingAggregate>();
  private reservations = new Map<string, MarketplaceReservation>();
  private offers = new Map<string, MarketplaceOffer>();
  private bids = new Map<string, MarketplaceBid[]>();
  private conversations = new Map<string, MarketplaceConversation>();
  private notifications: MarketplaceNotification[] = [];
  private notificationPreferences = new Map<string, MarketplaceNotificationPreferences>();
  private attachments = new Map<string, MarketplaceStoredAttachment>();
  private orders = new Map<string, MarketplaceOrder>();
  private payments = new Map<string, MarketplacePayment>();
  private receipts = new Map<string, MarketplaceReceipt>();
  private reports = new Map<string, MarketplaceReport>();
  private commands = new Map<string, StoredCommand>();
  private events: MarketplaceEvent[] = [];
  private lockTail: Promise<void> = Promise.resolve();

  async transaction<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = this.lockTail;
    let release = (): void => {};
    this.lockTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  getListing(id: string): MarketplaceListingAggregate | undefined {
    return this.listings.get(id);
  }

  putListing(listing: MarketplaceListingAggregate): void {
    this.listings.set(listing.aggregateId, listing);
  }

  putReservation(reservation: MarketplaceReservation): void {
    this.reservations.set(reservation.id, reservation);
  }

  getOffer(id: string): MarketplaceOffer | undefined {
    return this.offers.get(id);
  }

  putOffer(offer: MarketplaceOffer): void {
    this.offers.set(offer.id, offer);
  }

  getOffersForListing(listingAggregateId: string): MarketplaceOffer[] {
    return [...this.offers.values()].filter((offer) => offer.listingAggregateId === listingAggregateId);
  }

  getOffersForActor(actorPubky: string): MarketplaceOffer[] {
    return [...this.offers.values()].filter(
      (offer) => offer.buyerPubky === actorPubky || offer.sellerPubky === actorPubky,
    );
  }

  putBid(bid: MarketplaceBid): void {
    const current = this.bids.get(bid.listingAggregateId) ?? [];
    this.bids.set(bid.listingAggregateId, [...current, bid]);
  }

  getBidsForListing(listingAggregateId: string): MarketplaceBid[] {
    return [...(this.bids.get(listingAggregateId) ?? [])];
  }

  getConversation(id: string): MarketplaceConversation | undefined {
    return this.conversations.get(id);
  }

  putConversation(conversation: MarketplaceConversation): void {
    this.conversations.set(conversation.id, conversation);
  }

  getConversationsForActor(actorPubky: string): MarketplaceConversation[] {
    return [...this.conversations.values()].filter(
      (conversation) => conversation.sellerPubky === actorPubky || conversation.buyerPubky === actorPubky,
    );
  }

  appendNotification(notification: MarketplaceNotification): void {
    this.notifications.push(notification);
  }

  getNotification(id: string): MarketplaceNotification | undefined {
    return this.notifications.find((notification) => notification.id === id);
  }

  putNotification(notification: MarketplaceNotification): void {
    this.notifications = this.notifications.map((current) => (current.id === notification.id ? notification : current));
  }

  getNotificationsForActor(actorPubky: string): MarketplaceNotification[] {
    return this.notifications
      .filter(({ recipientPubky }) => recipientPubky === actorPubky)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getNotificationPreferences(actorPubky: string): MarketplaceNotificationPreferences | undefined {
    return this.notificationPreferences.get(actorPubky);
  }

  putNotificationPreferences(preferences: MarketplaceNotificationPreferences): void {
    this.notificationPreferences.set(preferences.ownerPubky, preferences);
  }

  putAttachment(attachment: MarketplaceStoredAttachment): void {
    this.attachments.set(attachment.id, attachment);
  }

  getAttachment(id: string): MarketplaceStoredAttachment | undefined {
    return this.attachments.get(id);
  }

  putOrder(order: MarketplaceOrder): void {
    this.orders.set(order.id, order);
  }

  getOrder(id: string): MarketplaceOrder | undefined {
    return this.orders.get(id);
  }

  getOrdersForActor(actorPubky: string): MarketplaceOrder[] {
    return [...this.orders.values()]
      .filter((order) => order.buyerPubky === actorPubky || order.sellerPubky === actorPubky)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  putPayment(payment: MarketplacePayment): void {
    this.payments.set(payment.id, payment);
  }

  getPayment(id: string): MarketplacePayment | undefined {
    return this.payments.get(id);
  }

  putReceipt(receipt: MarketplaceReceipt): void {
    this.receipts.set(receipt.id, receipt);
  }

  getReceipt(id: string): MarketplaceReceipt | undefined {
    return this.receipts.get(id);
  }

  putReport(report: MarketplaceReport): void {
    this.reports.set(report.id, report);
  }

  getReports(): MarketplaceReport[] {
    return [...this.reports.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getStoredCommand(actorPubky: string, commandId: string): StoredCommand | undefined {
    return this.commands.get(`${actorPubky}:${commandId}`);
  }

  putStoredCommand(actorPubky: string, commandId: string, stored: StoredCommand): void {
    this.commands.set(`${actorPubky}:${commandId}`, stored);
  }

  appendEvent(event: MarketplaceEvent): void {
    this.events.push(event);
  }

  getEvents(): MarketplaceEvent[] {
    return [...this.events];
  }
}

export class MarketplaceTransactionService {
  constructor(
    private readonly repository: InMemoryMarketplaceRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getListingProjection(aggregateId: string): MarketplaceListingAggregate | undefined {
    return this.repository.getListing(aggregateId);
  }

  getParticipantOffers(actorPubky: string, listingAggregateId: string): MarketplaceOffer[] {
    return this.repository
      .getOffersForListing(listingAggregateId)
      .filter((offer) => offer.buyerPubky === actorPubky || offer.sellerPubky === actorPubky);
  }

  getOffers(actorPubky: string): MarketplaceOffer[] {
    return this.repository.getOffersForActor(actorPubky);
  }

  getParticipantConversations(actorPubky: string): MarketplaceConversation[] {
    return this.repository.getConversationsForActor(actorPubky);
  }

  getNotifications(actorPubky: string): MarketplaceNotification[] {
    return this.repository.getNotificationsForActor(actorPubky);
  }

  getNotificationPreferences(actorPubky: string): MarketplaceNotificationPreferences {
    return (
      this.repository.getNotificationPreferences(actorPubky) ?? {
        ownerPubky: actorPubky,
        revision: 0,
        messages: true,
        offers: true,
        bids: true,
        auctions: true,
        updatedAt: this.now().toISOString(),
      }
    );
  }

  storeAttachment(
    actorPubky: string,
    recipientPubky: string,
    mimeType: string,
    bytes: Uint8Array,
  ): MarketplaceAttachmentStoreResult {
    if (!commercePubkySchema.safeParse(actorPubky).success || !commercePubkySchema.safeParse(recipientPubky).success) {
      return { ok: false, code: 'UNAUTHORIZED', message: 'Valid attachment participants are required.' };
    }
    if (actorPubky === recipientPubky) {
      return { ok: false, code: 'UNAUTHORIZED', message: 'Attachment participants must differ.' };
    }
    if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024 || !hasImageSignature(mimeType, bytes)) {
      return { ok: false, code: 'INVALID_ATTACHMENT', message: 'Attachment must be a valid JPEG, PNG, or WebP.' };
    }
    const attachment: MarketplaceStoredAttachment = {
      id: randomUUID(),
      senderPubky: actorPubky,
      recipientPubky,
      mimeType: mimeType as MarketplaceAttachmentMetadata['mimeType'],
      byteSize: bytes.byteLength,
      contentHash: bytesToHex(blake3(bytes)),
      createdAt: this.now().toISOString(),
      bytes,
      messageId: null,
    };
    this.repository.putAttachment(attachment);
    return { ok: true, attachment: toAttachmentMetadata(attachment) };
  }

  getAttachment(actorPubky: string, attachmentId: string): MarketplaceStoredAttachment | null {
    const attachment = this.repository.getAttachment(attachmentId);
    if (!attachment) return null;
    return attachment.senderPubky === actorPubky || attachment.recipientPubky === actorPubky ? attachment : null;
  }

  getOrders(actorPubky: string): MarketplaceOrder[] {
    return this.repository.getOrdersForActor(actorPubky);
  }

  getPayment(actorPubky: string, paymentId: string): MarketplacePayment | null {
    const payment = this.repository.getPayment(paymentId);
    return payment && (payment.buyerPubky === actorPubky || payment.sellerPubky === actorPubky) ? payment : null;
  }

  getReceipt(actorPubky: string, receiptId: string): MarketplaceReceipt | null {
    const receipt = this.repository.getReceipt(receiptId);
    return receipt && (receipt.recipientPubky === actorPubky || receipt.issuerPubky === actorPubky) ? receipt : null;
  }

  getReports(actorPubky: string): MarketplaceReport[] {
    return actorPubky === MARKETPLACE_SANDBOX_MODERATOR ? this.repository.getReports() : [];
  }

  async execute(actorInput: unknown, commandInput: unknown): Promise<MarketplaceCommandResult> {
    const actorResult = commercePubkySchema.safeParse(actorInput);
    const commandResult = marketplaceCommandSchema.safeParse(commandInput);
    if (!actorResult.success || !commandResult.success) {
      const issues = [
        ...(actorResult.success
          ? []
          : actorResult.error.issues.map(({ message, path }) => ({ path: `actor.${path.join('.')}`, message }))),
        ...(commandResult.success
          ? []
          : commandResult.error.issues.map(({ message, path }) => ({ path: path.join('.'), message }))),
      ];
      return failure('INVALID_COMMAND', 'The marketplace command is invalid.', { issues });
    }

    const actorPubky = actorResult.data;
    const command = commandResult.data;
    const requestHash = hashCommand(command);

    return await this.repository.transaction(() => {
      const stored = this.repository.getStoredCommand(actorPubky, command.commandId);
      if (stored) {
        return stored.requestHash === requestHash
          ? stored.result
          : failure('IDEMPOTENCY_CONFLICT', 'The command id was already used with different input.');
      }

      const result = this.dispatchCommand(actorPubky, command);

      if (result.ok) {
        this.repository.putStoredCommand(actorPubky, command.commandId, { requestHash, result });
      }
      return result;
    });
  }

  private dispatchCommand(actorPubky: string, command: MarketplaceCommand): MarketplaceCommandResult {
    switch (command.kind) {
      case 'listing.register':
        return this.registerListing(actorPubky, command);
      case 'inventory.reserve':
        return this.reserveInventory(actorPubky, command);
      case 'offer.create':
        return this.createOffer(actorPubky, command);
      case 'offer.counter':
        return this.counterOffer(actorPubky, command);
      case 'offer.accept':
        return this.acceptOffer(actorPubky, command);
      case 'offer.reject':
        return this.rejectOffer(actorPubky, command);
      case 'offer.withdraw':
        return this.withdrawOffer(actorPubky, command);
      case 'auction.place_bid':
        return this.placeBid(actorPubky, command);
      case 'message.send':
        return this.sendMessage(actorPubky, command);
      case 'auction.close':
        return this.closeAuction(actorPubky, command);
      case 'notification.mark_read':
        return this.markNotificationRead(actorPubky, command);
      case 'notification.preferences.update':
        return this.updateNotificationPreferences(actorPubky, command);
      case 'checkout.create':
        return this.createCheckout(actorPubky, command);
      case 'payment.sandbox_advance':
        return this.advanceSandboxPayment(actorPubky, command);
      case 'payment.register_locks':
        // The sandbox has no Lock Server and no verification worker, so it
        // refuses the registration outright — mirroring the durable service's
        // fail-closed behavior when Locks is not configured.
        return failure('INVALID_COMMAND', 'Locks verification is not available on the sandbox service.');
      case 'order.cancel_request':
        return this.requestCancellation(actorPubky, command);
      case 'order.cancel_approve':
        return this.approveCancellation(actorPubky, command);
      case 'fulfillment.ship':
        return this.shipOrder(actorPubky, command);
      case 'fulfillment.confirm_delivery':
        return this.confirmDelivery(actorPubky, command);
      case 'return.request':
        return this.requestReturn(actorPubky, command);
      case 'return.approve':
        return this.approveReturn(actorPubky, command);
      case 'return.receive':
        return this.receiveReturn(actorPubky, command);
      case 'refund.record_external':
        return this.recordExternalRefund(actorPubky, command);
      case 'dispute.open':
        return this.openDispute(actorPubky, command);
      case 'dispute.evidence':
        // The sandbox prototype keeps no evidence records — the command
        // exists only on the durable service. Refuse honestly rather than
        // accept a body this service could neither store nor serve.
        return failure('INVALID_COMMAND', 'The sandbox marketplace does not store dispute evidence.');
      case 'dispute.resolve':
        return this.resolveDispute(actorPubky, command);
      case 'review.create':
        return this.createReview(actorPubky, command);
      case 'trust.report':
        return this.createReport(actorPubky, command);
    }
  }

  private registerListing(actorPubky: string, command: RegisterListingCommand): MarketplaceCommandResult {
    const { payload } = command;
    if (actorPubky !== payload.sellerPubky) {
      return failure('UNAUTHORIZED', 'Only the listing seller may register inventory.');
    }

    const expectedAggregateId = buildMarketplaceListingAggregateId(payload.sellerPubky, payload.listingId);
    if (command.aggregateId !== expectedAggregateId) {
      return failure('INVALID_COMMAND', 'The listing aggregate id does not match its seller and listing.');
    }

    const current = this.repository.getListing(command.aggregateId);
    const currentRevision = current?.serverRevision ?? 0;
    if (command.expectedRevision !== currentRevision) {
      return failure('REVISION_CONFLICT', 'The listing revision is stale.', { currentRevision });
    }
    if (current && payload.listingRevision <= current.listingRevision) {
      return failure('REVISION_CONFLICT', 'The public listing revision must advance.', { currentRevision });
    }

    const committedQuantity = (current?.reservedQuantity ?? 0) + (current?.soldQuantity ?? 0);
    if (payload.quantity < committedQuantity) {
      return failure('INVARIANT_VIOLATION', 'Listing quantity cannot fall below committed inventory.', {
        currentRevision,
      });
    }

    const occurredAt = this.now().toISOString();
    const listing: MarketplaceListingAggregate = {
      aggregateId: command.aggregateId,
      sellerPubky: payload.sellerPubky,
      listingId: payload.listingId,
      title: payload.title,
      listingRevision: payload.listingRevision,
      contentHash: payload.contentHash,
      serverRevision: currentRevision + 1,
      state: payload.quantity === committedQuantity ? (committedQuantity > 0 ? 'reserved' : 'sold') : 'available',
      totalQuantity: payload.quantity,
      availableQuantity: payload.quantity - committedQuantity,
      reservedQuantity: current?.reservedQuantity ?? 0,
      soldQuantity: current?.soldQuantity ?? 0,
      unitPrice: payload.unitPrice,
      saleFormat: payload.saleFormat,
      auction: payload.auctionTerms
        ? {
            ...payload.auctionTerms,
            status:
              current?.auction?.status ??
              (Date.parse(payload.auctionTerms.startsAt) > Date.parse(occurredAt) ? 'scheduled' : 'active'),
            currentPrice: current?.auction?.currentPrice ?? payload.unitPrice,
            leaderPubky: current?.auction?.leaderPubky ?? null,
            bidCount: current?.auction?.bidCount ?? 0,
            reserveMet:
              current?.auction?.reserveMet ??
              (payload.auctionTerms.reservePrice
                ? payload.unitPrice.amountMinor >= payload.auctionTerms.reservePrice.amountMinor
                : true),
          }
        : null,
      updatedAt: occurredAt,
    };
    const event = this.createEvent(actorPubky, command, listing.serverRevision, 'listing.registered', occurredAt);
    this.repository.putListing(listing);
    this.repository.appendEvent(event);
    return success(command, listing.serverRevision, event.id, { kind: 'listing', listing });
  }

  private reserveInventory(actorPubky: string, command: ReserveInventoryCommand): MarketplaceCommandResult {
    const listing = this.repository.getListing(command.aggregateId);
    if (!listing) return failure('NOT_FOUND', 'The listing is not registered.');
    if (listing.sellerPubky === actorPubky) {
      return failure('UNAUTHORIZED', 'A seller cannot reserve their own listing.');
    }
    if (command.expectedRevision !== listing.serverRevision) {
      return failure('REVISION_CONFLICT', 'The listing revision is stale.', {
        currentRevision: listing.serverRevision,
      });
    }
    if (listing.availableQuantity < command.payload.quantity) {
      return failure('INSUFFICIENT_INVENTORY', 'The requested quantity is unavailable.', {
        currentRevision: listing.serverRevision,
      });
    }

    const now = this.now();
    const occurredAt = now.toISOString();
    const reservation: MarketplaceReservation = {
      id: command.commandId,
      aggregateId: command.aggregateId,
      buyerPubky: actorPubky,
      quantity: command.payload.quantity,
      status: 'active',
      expiresAt: new Date(now.getTime() + command.payload.reservationTtlSeconds * 1_000).toISOString(),
      createdAt: occurredAt,
    };
    const updatedListing: MarketplaceListingAggregate = {
      ...listing,
      serverRevision: listing.serverRevision + 1,
      state: listing.availableQuantity === command.payload.quantity ? 'reserved' : 'available',
      availableQuantity: listing.availableQuantity - command.payload.quantity,
      reservedQuantity: listing.reservedQuantity + command.payload.quantity,
      updatedAt: occurredAt,
    };
    const event = this.createEvent(
      actorPubky,
      command,
      updatedListing.serverRevision,
      'inventory.reserved',
      occurredAt,
    );
    this.repository.putListing(updatedListing);
    this.repository.putReservation(reservation);
    this.repository.appendEvent(event);
    return success(command, updatedListing.serverRevision, event.id, {
      kind: 'reservation',
      listing: updatedListing,
      reservation,
    });
  }

  private createOffer(actorPubky: string, command: CreateOfferCommand): MarketplaceCommandResult {
    const listing = this.repository.getListing(command.aggregateId);
    if (!listing) return failure('NOT_FOUND', 'The listing is not registered.');
    if (listing.sellerPubky === actorPubky) {
      return failure('UNAUTHORIZED', 'A seller cannot make an offer on their own listing.');
    }
    if (command.expectedRevision !== listing.serverRevision) {
      return failure('REVISION_CONFLICT', 'The listing revision is stale.', {
        currentRevision: listing.serverRevision,
      });
    }
    if (listing.availableQuantity < command.payload.quantity) {
      return failure('INSUFFICIENT_INVENTORY', 'The requested offer quantity is unavailable.', {
        currentRevision: listing.serverRevision,
      });
    }
    if (!sameAsset(listing.unitPrice, command.payload.amount)) {
      return failure('INVALID_COMMAND', 'Offer amount must use the listing asset and exponent.');
    }

    const now = this.now();
    const occurredAt = now.toISOString();
    const offer: MarketplaceOffer = {
      id: command.commandId,
      aggregateId: buildMarketplaceOfferAggregateId(command.commandId),
      listingAggregateId: listing.aggregateId,
      buyerPubky: actorPubky,
      sellerPubky: listing.sellerPubky,
      revision: 1,
      state: 'pending',
      offeredBy: actorPubky,
      amount: command.payload.amount,
      quantity: command.payload.quantity,
      message: command.payload.message,
      expiresAt: new Date(now.getTime() + command.payload.expiresInSeconds * 1_000).toISOString(),
      createdAt: occurredAt,
      updatedAt: occurredAt,
      history: [
        {
          revision: 1,
          actorPubky,
          action: 'created',
          amount: command.payload.amount,
          quantity: command.payload.quantity,
          message: command.payload.message,
          occurredAt,
        },
      ],
    };
    const event = this.createEvent(actorPubky, command, offer.revision, 'offer.created', occurredAt);
    this.repository.putOffer(offer);
    this.repository.appendEvent(event);
    this.notify(offer.sellerPubky, actorPubky, 'offer_received', offer.aggregateId, occurredAt);
    return success(command, offer.revision, event.id, { kind: 'offer', offer });
  }

  private counterOffer(actorPubky: string, command: CounterOfferCommand): MarketplaceCommandResult {
    const offer = this.getActionableOffer(actorPubky, command.payload.offerId, command.aggregateId);
    if (!offer.ok) return offer.failure;
    if (command.expectedRevision !== offer.value.revision) {
      return failure('REVISION_CONFLICT', 'The offer revision is stale.', {
        currentRevision: offer.value.revision,
      });
    }
    if (actorPubky === offer.value.offeredBy) {
      return failure('UNAUTHORIZED', 'The current offer author cannot counter their own terms.');
    }
    if (!sameAsset(offer.value.amount, command.payload.amount)) {
      return failure('INVALID_COMMAND', 'Counteroffer amount must use the original asset and exponent.');
    }
    const listing = this.repository.getListing(offer.value.listingAggregateId);
    if (!listing) return failure('NOT_FOUND', 'The offer listing is unavailable.');
    if (listing.availableQuantity < command.payload.quantity) {
      return failure('INSUFFICIENT_INVENTORY', 'The counteroffer quantity is unavailable.', {
        currentRevision: offer.value.revision,
      });
    }

    const now = this.now();
    const occurredAt = now.toISOString();
    const updated: MarketplaceOffer = {
      ...offer.value,
      revision: offer.value.revision + 1,
      state: 'countered',
      offeredBy: actorPubky,
      amount: command.payload.amount,
      quantity: command.payload.quantity,
      message: command.payload.message,
      expiresAt: new Date(now.getTime() + command.payload.expiresInSeconds * 1_000).toISOString(),
      updatedAt: occurredAt,
      history: [
        ...offer.value.history,
        {
          revision: offer.value.revision + 1,
          actorPubky,
          action: 'countered',
          amount: command.payload.amount,
          quantity: command.payload.quantity,
          message: command.payload.message,
          occurredAt,
        },
      ],
    };
    const event = this.createEvent(actorPubky, command, updated.revision, 'offer.countered', occurredAt);
    this.repository.putOffer(updated);
    this.repository.appendEvent(event);
    this.notify(
      actorPubky === updated.sellerPubky ? updated.buyerPubky : updated.sellerPubky,
      actorPubky,
      'offer_countered',
      updated.aggregateId,
      occurredAt,
    );
    return success(command, updated.revision, event.id, { kind: 'offer', offer: updated });
  }

  private acceptOffer(actorPubky: string, command: AcceptOfferCommand): MarketplaceCommandResult {
    const offer = this.getActionableOffer(actorPubky, command.payload.offerId, command.aggregateId);
    if (!offer.ok) return offer.failure;
    if (command.expectedRevision !== offer.value.revision) {
      return failure('REVISION_CONFLICT', 'The offer revision is stale.', {
        currentRevision: offer.value.revision,
      });
    }
    if (actorPubky === offer.value.offeredBy) {
      return failure('UNAUTHORIZED', 'The current offer author cannot accept their own terms.');
    }
    const listing = this.repository.getListing(offer.value.listingAggregateId);
    if (!listing) return failure('NOT_FOUND', 'The offer listing is unavailable.');
    if (listing.availableQuantity < offer.value.quantity) {
      return failure('INSUFFICIENT_INVENTORY', 'The offered quantity is no longer available.', {
        currentRevision: offer.value.revision,
      });
    }

    const now = this.now();
    const occurredAt = now.toISOString();
    const acceptedOffer = this.finishOffer(offer.value, actorPubky, 'accepted', occurredAt);
    const reservation: MarketplaceReservation = {
      id: command.commandId,
      aggregateId: listing.aggregateId,
      buyerPubky: acceptedOffer.buyerPubky,
      quantity: acceptedOffer.quantity,
      status: 'active',
      expiresAt: new Date(now.getTime() + 30 * 60 * 1_000).toISOString(),
      createdAt: occurredAt,
    };
    const updatedListing: MarketplaceListingAggregate = {
      ...listing,
      serverRevision: listing.serverRevision + 1,
      state: listing.availableQuantity === acceptedOffer.quantity ? 'reserved' : 'available',
      availableQuantity: listing.availableQuantity - acceptedOffer.quantity,
      reservedQuantity: listing.reservedQuantity + acceptedOffer.quantity,
      updatedAt: occurredAt,
    };
    const offerEvent = this.createEvent(actorPubky, command, acceptedOffer.revision, 'offer.accepted', occurredAt);
    const inventoryEvent = this.createEvent(
      actorPubky,
      command,
      updatedListing.serverRevision,
      'inventory.reserved',
      occurredAt,
      updatedListing.aggregateId,
    );
    this.repository.putOffer(acceptedOffer);
    this.repository.putListing(updatedListing);
    this.repository.putReservation(reservation);
    this.repository.appendEvent(offerEvent);
    this.repository.appendEvent(inventoryEvent);
    this.notify(
      actorPubky === acceptedOffer.sellerPubky ? acceptedOffer.buyerPubky : acceptedOffer.sellerPubky,
      actorPubky,
      'offer_accepted',
      acceptedOffer.aggregateId,
      occurredAt,
    );
    return success(command, acceptedOffer.revision, [offerEvent.id, inventoryEvent.id], {
      kind: 'accepted_offer',
      offer: acceptedOffer,
      listing: updatedListing,
      reservation,
    });
  }

  private rejectOffer(actorPubky: string, command: RejectOfferCommand): MarketplaceCommandResult {
    return this.completeOfferAction(actorPubky, command, 'rejected', 'offer.rejected');
  }

  private withdrawOffer(actorPubky: string, command: WithdrawOfferCommand): MarketplaceCommandResult {
    const offer = this.getActionableOffer(actorPubky, command.payload.offerId, command.aggregateId);
    if (!offer.ok) return offer.failure;
    if (actorPubky !== offer.value.offeredBy) {
      return failure('UNAUTHORIZED', 'Only the current offer author may withdraw it.');
    }
    return this.completeOfferAction(actorPubky, command, 'withdrawn', 'offer.withdrawn');
  }

  private completeOfferAction(
    actorPubky: string,
    command: RejectOfferCommand | WithdrawOfferCommand,
    state: 'rejected' | 'withdrawn',
    eventKind: 'offer.rejected' | 'offer.withdrawn',
  ): MarketplaceCommandResult {
    const offer = this.getActionableOffer(actorPubky, command.payload.offerId, command.aggregateId);
    if (!offer.ok) return offer.failure;
    if (command.expectedRevision !== offer.value.revision) {
      return failure('REVISION_CONFLICT', 'The offer revision is stale.', {
        currentRevision: offer.value.revision,
      });
    }
    if (state === 'rejected' && actorPubky === offer.value.offeredBy) {
      return failure('UNAUTHORIZED', 'The current offer author cannot reject their own terms.');
    }

    const occurredAt = this.now().toISOString();
    const updated = this.finishOffer(offer.value, actorPubky, state, occurredAt);
    const event = this.createEvent(actorPubky, command, updated.revision, eventKind, occurredAt);
    this.repository.putOffer(updated);
    this.repository.appendEvent(event);
    if (state === 'rejected') {
      this.notify(
        actorPubky === updated.sellerPubky ? updated.buyerPubky : updated.sellerPubky,
        actorPubky,
        'offer_rejected',
        updated.aggregateId,
        occurredAt,
      );
    }
    return success(command, updated.revision, event.id, { kind: 'offer', offer: updated });
  }

  private getActionableOffer(
    actorPubky: string,
    offerId: string,
    aggregateId: string,
  ): { ok: true; value: MarketplaceOffer } | { ok: false; failure: MarketplaceCommandFailure } {
    const offer = this.repository.getOffer(offerId);
    if (!offer) return { ok: false, failure: failure('NOT_FOUND', 'The offer was not found.') };
    if (aggregateId !== offer.aggregateId) {
      return { ok: false, failure: failure('INVALID_COMMAND', 'The offer aggregate id is invalid.') };
    }
    if (actorPubky !== offer.buyerPubky && actorPubky !== offer.sellerPubky) {
      return { ok: false, failure: failure('UNAUTHORIZED', 'Only offer participants may act on it.') };
    }
    if (offer.state !== 'pending' && offer.state !== 'countered') {
      return { ok: false, failure: failure('INVALID_STATE', 'The offer is no longer actionable.') };
    }
    if (Date.parse(offer.expiresAt) <= this.now().getTime()) {
      return { ok: false, failure: failure('OFFER_EXPIRED', 'The offer has expired.') };
    }
    return { ok: true, value: offer };
  }

  private finishOffer(
    offer: MarketplaceOffer,
    actorPubky: string,
    state: 'accepted' | 'rejected' | 'withdrawn',
    occurredAt: string,
  ): MarketplaceOffer {
    const revision = offer.revision + 1;
    return {
      ...offer,
      revision,
      state,
      updatedAt: occurredAt,
      history: [
        ...offer.history,
        {
          revision,
          actorPubky,
          action: state,
          amount: offer.amount,
          quantity: offer.quantity,
          message: '',
          occurredAt,
        },
      ],
    };
  }

  private placeBid(actorPubky: string, command: PlaceBidCommand): MarketplaceCommandResult {
    const listing = this.repository.getListing(command.aggregateId);
    if (!listing) return failure('NOT_FOUND', 'The auction listing is not registered.');
    if (listing.sellerPubky === actorPubky) {
      return failure('UNAUTHORIZED', 'A seller cannot bid on their own auction.');
    }
    if (listing.saleFormat !== 'auction' || !listing.auction) {
      return failure('INVALID_STATE', 'This listing is not an auction.');
    }
    if (listing.auction.status !== 'active') {
      return failure('AUCTION_CLOSED', 'The auction is not open for bidding.');
    }
    if (command.expectedRevision !== listing.serverRevision) {
      return failure('REVISION_CONFLICT', 'The auction revision is stale.', {
        currentRevision: listing.serverRevision,
      });
    }
    const now = this.now();
    const nowMs = now.getTime();
    if (nowMs < Date.parse(listing.auction.startsAt) || nowMs >= Date.parse(listing.auction.endsAt)) {
      return failure('AUCTION_CLOSED', 'The auction is not open for bidding.');
    }
    if (!sameAsset(listing.unitPrice, command.payload.maximumAmount)) {
      return failure('INVALID_COMMAND', 'Bid maximum must use the auction asset and exponent.');
    }
    if (command.payload.maximumAmount.amountMinor <= listing.auction.currentPrice.amountMinor) {
      return failure('BID_TOO_LOW', 'Bid maximum must exceed the current visible price.', {
        currentRevision: listing.serverRevision,
      });
    }

    const previousBids = this.repository.getBidsForListing(listing.aggregateId);
    const bidderPreviousMaximum = previousBids
      .filter((bid) => bid.bidderPubky === actorPubky)
      .reduce((maximum, bid) => Math.max(maximum, bid.maximumAmount.amountMinor), 0);
    if (command.payload.maximumAmount.amountMinor <= bidderPreviousMaximum) {
      return failure('BID_TOO_LOW', 'A new proxy maximum must exceed the bidder previous maximum.', {
        currentRevision: listing.serverRevision,
      });
    }

    const occurredAt = now.toISOString();
    const bid: MarketplaceBid = {
      id: command.commandId,
      listingAggregateId: listing.aggregateId,
      bidderPubky: actorPubky,
      maximumAmount: command.payload.maximumAmount,
      sequence: listing.auction.bidCount + 1,
      createdAt: occurredAt,
    };
    const bidderMaximums = latestBidderMaximums([...previousBids, bid]);
    const ranked = [...bidderMaximums.values()].sort(
      (left, right) =>
        right.maximumAmount.amountMinor - left.maximumAmount.amountMinor || left.sequence - right.sequence,
    );
    const leader = ranked[0];
    const runnerUp = ranked[1];
    const visibleAmount = runnerUp
      ? Math.min(
          leader.maximumAmount.amountMinor,
          runnerUp.maximumAmount.amountMinor + listing.auction.minimumIncrement.amountMinor,
        )
      : listing.unitPrice.amountMinor;
    const remainingMs = Date.parse(listing.auction.endsAt) - nowMs;
    const shouldExtend =
      listing.auction.antiSnipingWindowSeconds > 0 && remainingMs <= listing.auction.antiSnipingWindowSeconds * 1_000;
    const endsAt = shouldExtend
      ? new Date(nowMs + listing.auction.antiSnipingExtensionSeconds * 1_000).toISOString()
      : listing.auction.endsAt;
    const currentPrice = { ...listing.unitPrice, amountMinor: visibleAmount };
    const updatedListing: MarketplaceListingAggregate = {
      ...listing,
      serverRevision: listing.serverRevision + 1,
      auction: {
        ...listing.auction,
        endsAt,
        currentPrice,
        leaderPubky: leader.bidderPubky,
        bidCount: listing.auction.bidCount + 1,
        reserveMet: listing.auction.reservePrice ? visibleAmount >= listing.auction.reservePrice.amountMinor : true,
      },
      updatedAt: occurredAt,
    };
    const event = this.createEvent(
      actorPubky,
      command,
      updatedListing.serverRevision,
      'auction.bid_placed',
      occurredAt,
    );
    this.repository.putBid(bid);
    this.repository.putListing(updatedListing);
    this.repository.appendEvent(event);
    if (
      listing.auction.leaderPubky &&
      listing.auction.leaderPubky !== updatedListing.auction?.leaderPubky &&
      listing.auction.leaderPubky !== actorPubky
    ) {
      this.notify(listing.auction.leaderPubky, actorPubky, 'outbid', listing.aggregateId, occurredAt);
    }
    return success(command, updatedListing.serverRevision, event.id, {
      kind: 'bid',
      listing: updatedListing,
      bid,
    });
  }

  private closeAuction(actorPubky: string, command: CloseAuctionCommand): MarketplaceCommandResult {
    const listing = this.repository.getListing(command.aggregateId);
    if (!listing) return failure('NOT_FOUND', 'The auction listing is not registered.');
    if (listing.sellerPubky !== actorPubky) {
      return failure('UNAUTHORIZED', 'Only the seller may close this sandbox auction.');
    }
    if (!listing.auction || listing.saleFormat !== 'auction' || listing.auction.status !== 'active') {
      return failure('INVALID_STATE', 'The auction is not active.');
    }
    if (command.expectedRevision !== listing.serverRevision) {
      return failure('REVISION_CONFLICT', 'The auction revision is stale.', {
        currentRevision: listing.serverRevision,
      });
    }
    const now = this.now();
    if (now.getTime() < Date.parse(listing.auction.endsAt)) {
      return failure('AUCTION_CLOSED', 'The auction has not ended yet.');
    }

    const sold = Boolean(listing.auction.leaderPubky && listing.auction.reserveMet);
    const occurredAt = now.toISOString();
    const reservation: MarketplaceReservation | null =
      sold && listing.auction.leaderPubky
        ? {
            id: command.commandId,
            aggregateId: listing.aggregateId,
            buyerPubky: listing.auction.leaderPubky,
            quantity: 1,
            status: 'active',
            expiresAt: new Date(now.getTime() + 30 * 60 * 1_000).toISOString(),
            createdAt: occurredAt,
          }
        : null;
    const updatedListing: MarketplaceListingAggregate = {
      ...listing,
      serverRevision: listing.serverRevision + 1,
      state: sold ? 'reserved' : 'available',
      availableQuantity: sold ? listing.availableQuantity - 1 : listing.availableQuantity,
      reservedQuantity: sold ? listing.reservedQuantity + 1 : listing.reservedQuantity,
      auction: {
        ...listing.auction,
        status: sold ? 'sold' : 'unsold',
      },
      updatedAt: occurredAt,
    };
    const event = this.createEvent(
      actorPubky,
      command,
      updatedListing.serverRevision,
      sold ? 'auction.closed_sold' : 'auction.closed_unsold',
      occurredAt,
    );
    this.repository.putListing(updatedListing);
    if (reservation) this.repository.putReservation(reservation);
    this.repository.appendEvent(event);
    if (reservation) {
      this.notify(reservation.buyerPubky, actorPubky, 'auction_won', listing.aggregateId, occurredAt);
    }
    return success(command, updatedListing.serverRevision, event.id, {
      kind: 'auction_result',
      outcome: sold ? 'sold' : 'unsold',
      winnerPubky: reservation?.buyerPubky ?? null,
      listing: updatedListing,
      reservation,
    });
  }

  private sendMessage(actorPubky: string, command: SendMarketplaceMessageCommand): MarketplaceCommandResult {
    const listing = this.repository.getListing(command.payload.listingAggregateId);
    if (!listing) return failure('NOT_FOUND', 'The message listing is unavailable.');
    const actorIsSeller = actorPubky === listing.sellerPubky;
    if (!actorIsSeller && command.payload.recipientPubky !== listing.sellerPubky) {
      return failure('UNAUTHORIZED', 'A buyer may message only the listing seller.');
    }
    if (actorIsSeller && command.payload.recipientPubky === listing.sellerPubky) {
      return failure('UNAUTHORIZED', 'A seller cannot message themselves.');
    }

    const buyerPubky = actorIsSeller ? command.payload.recipientPubky : actorPubky;
    const expectedConversationId = buildMarketplaceConversationAggregateId(
      listing.sellerPubky,
      buyerPubky,
      listing.listingId,
    );
    if (command.aggregateId !== expectedConversationId) {
      return failure('INVALID_COMMAND', 'The conversation aggregate id is invalid.');
    }
    const current = this.repository.getConversation(command.aggregateId);
    const currentRevision = current?.revision ?? 0;
    if (command.expectedRevision !== currentRevision) {
      return failure('REVISION_CONFLICT', 'The conversation revision is stale.', { currentRevision });
    }
    const attachments = command.payload.attachmentIds.map((id) => this.repository.getAttachment(id));
    if (
      attachments.some(
        (attachment) =>
          !attachment ||
          attachment.senderPubky !== actorPubky ||
          attachment.recipientPubky !== command.payload.recipientPubky ||
          attachment.messageId !== null,
      )
    ) {
      return failure('INVALID_COMMAND', 'Message attachments are invalid, reused, or owned by another participant.');
    }

    const occurredAt = this.now().toISOString();
    const message: MarketplaceMessage = {
      id: command.commandId,
      conversationId: command.aggregateId,
      listingAggregateId: listing.aggregateId,
      senderPubky: actorPubky,
      recipientPubky: command.payload.recipientPubky,
      text: command.payload.text,
      attachments: attachments.map((attachment) => toAttachmentMetadata(attachment!)),
      createdAt: occurredAt,
    };
    const conversation: MarketplaceConversation = {
      id: command.aggregateId,
      listingAggregateId: listing.aggregateId,
      sellerPubky: listing.sellerPubky,
      buyerPubky,
      revision: currentRevision + 1,
      lastMessageAt: occurredAt,
      messages: [...(current?.messages ?? []), message],
    };
    const event = this.createEvent(actorPubky, command, conversation.revision, 'message.sent', occurredAt);
    this.repository.putConversation(conversation);
    for (const attachment of attachments) {
      this.repository.putAttachment({ ...attachment!, messageId: message.id });
    }
    this.repository.appendEvent(event);
    this.notify(message.recipientPubky, actorPubky, 'message_received', conversation.id, occurredAt);
    return success(command, conversation.revision, event.id, { kind: 'message', conversation, message });
  }

  private markNotificationRead(
    actorPubky: string,
    command: MarkMarketplaceNotificationReadCommand,
  ): MarketplaceCommandResult {
    const notification = this.repository.getNotification(command.payload.notificationId);
    if (!notification) return failure('NOT_FOUND', 'The notification was not found.');
    if (notification.recipientPubky !== actorPubky) {
      return failure('UNAUTHORIZED', 'Only the notification recipient may mark it read.');
    }
    if (command.aggregateId !== `notification:${notification.id}`) {
      return failure('INVALID_COMMAND', 'The notification aggregate id is invalid.');
    }
    if (command.expectedRevision !== notification.revision) {
      return failure('REVISION_CONFLICT', 'The notification revision is stale.', {
        currentRevision: notification.revision,
      });
    }
    if (notification.readAt) return failure('INVALID_STATE', 'The notification is already read.');

    const occurredAt = this.now().toISOString();
    const updated: MarketplaceNotification = {
      ...notification,
      revision: notification.revision + 1,
      readAt: occurredAt,
    };
    const event = this.createEvent(actorPubky, command, updated.revision, 'notification.read', occurredAt);
    this.repository.putNotification(updated);
    this.repository.appendEvent(event);
    return success(command, updated.revision, event.id, { kind: 'notification', notification: updated });
  }

  private updateNotificationPreferences(
    actorPubky: string,
    command: UpdateMarketplaceNotificationPreferencesCommand,
  ): MarketplaceCommandResult {
    if (command.aggregateId !== `notification_preferences:${actorPubky}`) {
      return failure('INVALID_COMMAND', 'The notification preferences aggregate id is invalid.');
    }
    const current = this.repository.getNotificationPreferences(actorPubky);
    const currentRevision = current?.revision ?? 0;
    if (command.expectedRevision !== currentRevision) {
      return failure('REVISION_CONFLICT', 'The notification preferences revision is stale.', { currentRevision });
    }
    const occurredAt = this.now().toISOString();
    const preferences: MarketplaceNotificationPreferences = {
      ownerPubky: actorPubky,
      revision: currentRevision + 1,
      ...command.payload,
      updatedAt: occurredAt,
    };
    const event = this.createEvent(
      actorPubky,
      command,
      preferences.revision,
      'notification.preferences_updated',
      occurredAt,
    );
    this.repository.putNotificationPreferences(preferences);
    this.repository.appendEvent(event);
    return success(command, preferences.revision, event.id, { kind: 'notification_preferences', preferences });
  }

  private createCheckout(actorPubky: string, command: CreateMarketplaceCheckoutCommand): MarketplaceCommandResult {
    if (
      command.aggregateId !== buildMarketplaceCheckoutAggregateId(command.commandId) ||
      command.expectedRevision !== 0
    ) {
      return failure('INVALID_COMMAND', 'Checkout aggregate identity or revision is invalid.');
    }
    const resolved = command.payload.lines.map((line) => ({
      requested: line,
      listing: this.repository.getListing(line.listingAggregateId),
    }));
    if (resolved.some(({ listing }) => !listing)) {
      return failure('NOT_FOUND', 'A checkout listing is unavailable.');
    }
    for (const { requested, listing } of resolved) {
      if (!listing) continue;
      if (listing.sellerPubky === actorPubky) {
        return failure('UNAUTHORIZED', 'A buyer cannot purchase their own listing.');
      }
      if (listing.saleFormat !== 'fixed_price' || listing.state !== 'available') {
        return failure('INVALID_STATE', 'Only available fixed-price listings can enter checkout.');
      }
      if (requested.expectedRevision !== listing.serverRevision) {
        return failure('REVISION_CONFLICT', 'A checkout listing revision is stale.', {
          currentRevision: listing.serverRevision,
        });
      }
      if (requested.quantity > listing.availableQuantity) {
        return failure('INSUFFICIENT_INVENTORY', 'Checkout quantity is unavailable.', {
          currentRevision: listing.serverRevision,
        });
      }
    }
    const listings = resolved.map(({ listing }) => listing!);
    const asset = listings[0].unitPrice;
    if (listings.some((listing) => !sameAsset(asset, listing.unitPrice))) {
      return failure('INVALID_COMMAND', 'One checkout may contain only one asset and exponent.');
    }

    const now = this.now();
    const occurredAt = now.toISOString();
    const sellerGroups = new Map<
      string,
      Array<{ requested: (typeof resolved)[number]['requested']; listing: MarketplaceListingAggregate }>
    >();
    for (const item of resolved) {
      const listing = item.listing!;
      const group = sellerGroups.get(listing.sellerPubky) ?? [];
      group.push({ requested: item.requested, listing });
      sellerGroups.set(listing.sellerPubky, group);
    }

    const orders: MarketplaceOrder[] = [];
    const payments: MarketplacePayment[] = [];
    const eventIds: string[] = [];
    for (const [sellerPubky, items] of sellerGroups) {
      const lines: MarketplaceOrderLine[] = items.map(({ requested, listing }) => ({
        listingAggregateId: listing.aggregateId,
        listingRevision: listing.listingRevision,
        contentHash: listing.contentHash,
        title: listing.title,
        quantity: requested.quantity,
        unitPrice: listing.unitPrice,
        subtotal: { ...listing.unitPrice, amountMinor: listing.unitPrice.amountMinor * requested.quantity },
      }));
      const subtotalMinor = lines.reduce((total, line) => total + line.subtotal.amountMinor, 0);
      const shippingMinor = 1_200;
      const taxMinor = Math.round((subtotalMinor + shippingMinor) * 0.08);
      const orderId = randomUUID();
      const paymentId = randomUUID();
      const order: MarketplaceOrder = {
        id: orderId,
        buyerPubky: actorPubky,
        sellerPubky,
        revision: 1,
        state: 'pending_payment',
        lines,
        deliveryAddress: command.payload.deliveryAddress,
        subtotal: { ...asset, amountMinor: subtotalMinor },
        shipping: { ...asset, amountMinor: shippingMinor },
        tax: { ...asset, amountMinor: taxMinor },
        total: { ...asset, amountMinor: subtotalMinor + shippingMinor + taxMinor },
        guaranteePolicyVersion: command.payload.guaranteePolicyVersion,
        paymentId,
        receiptId: null,
        cancellationReason: null,
        shipment: null,
        returnRequest: null,
        dispute: null,
        externalRefund: null,
        reviews: [],
        createdAt: occurredAt,
        updatedAt: occurredAt,
      };
      const payment: MarketplacePayment = {
        id: paymentId,
        orderId,
        buyerPubky: actorPubky,
        sellerPubky,
        revision: 1,
        adapter: 'sandbox',
        state: 'awaiting_entitlement',
        confirmations: 0,
        locksBundleId: randomUUID(),
        amount: order.total,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      };
      this.repository.putOrder(order);
      this.repository.putPayment(payment);
      orders.push(order);
      payments.push(payment);
      const event = this.createEvent(actorPubky, command, 1, 'order.created', occurredAt, `order:${orderId}`);
      this.repository.appendEvent(event);
      eventIds.push(event.id);
      this.notify(sellerPubky, actorPubky, 'order_created', `order:${orderId}`, occurredAt);
    }

    for (const { requested, listing } of resolved) {
      this.repository.putListing({
        ...listing!,
        serverRevision: listing!.serverRevision + 1,
        state: listing!.availableQuantity === requested.quantity ? 'reserved' : 'available',
        availableQuantity: listing!.availableQuantity - requested.quantity,
        reservedQuantity: listing!.reservedQuantity + requested.quantity,
        updatedAt: occurredAt,
      });
    }
    return success(command, 1, eventIds, { kind: 'checkout', orders, payments });
  }

  private advanceSandboxPayment(actorPubky: string, command: AdvanceSandboxPaymentCommand): MarketplaceCommandResult {
    const payment = this.repository.getPayment(command.payload.paymentId);
    if (!payment) return failure('NOT_FOUND', 'The sandbox payment was not found.');
    if (payment.buyerPubky !== actorPubky) {
      return failure('UNAUTHORIZED', 'Only the buyer may advance a sandbox payment.');
    }
    if (command.aggregateId !== buildMarketplacePaymentAggregateId(payment.id)) {
      return failure('INVALID_COMMAND', 'The payment aggregate id is invalid.');
    }
    if (command.expectedRevision !== payment.revision) {
      return failure('REVISION_CONFLICT', 'The payment revision is stale.', { currentRevision: payment.revision });
    }
    const allowed =
      payment.state === 'awaiting_entitlement'
        ? ['detected', 'confirmed', 'expired', 'manual_review']
        : payment.state === 'detected'
          ? ['confirmed', 'manual_review']
          : [];
    if (!allowed.includes(command.payload.target)) {
      return failure('INVALID_STATE', 'The sandbox payment transition is invalid.');
    }
    if (command.payload.target === 'confirmed' && command.payload.confirmations < 1) {
      return failure('INVALID_COMMAND', 'Confirmed payment requires at least one confirmation.');
    }

    const order = this.repository.getOrder(payment.orderId);
    if (!order) return failure('INVARIANT_VIOLATION', 'Payment order is missing.');
    const occurredAt = this.now().toISOString();
    const updatedPayment: MarketplacePayment = {
      ...payment,
      revision: payment.revision + 1,
      state: command.payload.target,
      confirmations: command.payload.confirmations,
      updatedAt: occurredAt,
    };
    const eventKind = `payment.${command.payload.target}` as MarketplaceEvent['kind'];
    const paymentEvent = this.createEvent(actorPubky, command, updatedPayment.revision, eventKind, occurredAt);
    let updatedOrder = order;
    let receipt: MarketplaceReceipt | null = null;
    const eventIds = [paymentEvent.id];
    if (updatedPayment.state === 'confirmed') {
      const receiptId = randomUUID();
      updatedOrder = {
        ...order,
        revision: order.revision + 1,
        state: 'paid',
        receiptId,
        updatedAt: occurredAt,
      };
      const receiptPayload = JSON.stringify({
        orderId: order.id,
        paymentId: payment.id,
        total: order.total,
        issuedAt: occurredAt,
      });
      receipt = {
        id: receiptId,
        orderId: order.id,
        paymentId: payment.id,
        issuerPubky: order.sellerPubky,
        recipientPubky: order.buyerPubky,
        total: order.total,
        contentHash: bytesToHex(blake3(new TextEncoder().encode(receiptPayload))),
        issuedAt: occurredAt,
      };
      const receiptEvent = this.createEvent(
        actorPubky,
        command,
        updatedOrder.revision,
        'receipt.issued',
        occurredAt,
        `order:${order.id}`,
      );
      eventIds.push(receiptEvent.id);
      this.repository.putReceipt(receipt);
      this.repository.appendEvent(receiptEvent);
      this.notify(order.sellerPubky, actorPubky, 'payment_confirmed', `order:${order.id}`, occurredAt);
    }
    this.repository.putPayment(updatedPayment);
    this.repository.putOrder(updatedOrder);
    this.repository.appendEvent(paymentEvent);
    return success(command, updatedPayment.revision, eventIds, {
      kind: 'payment',
      payment: updatedPayment,
      order: updatedOrder,
      receipt,
    });
  }

  private requestCancellation(actorPubky: string, command: RequestOrderCancellationCommand): MarketplaceCommandResult {
    const resolved = this.getOrderAction(actorPubky, command.payload.orderId, command);
    if (!resolved.ok) return resolved.failure;
    const order = resolved.order;
    if (order.buyerPubky !== actorPubky) return failure('UNAUTHORIZED', 'Only the buyer may request cancellation.');
    if (!['pending_payment', 'paid', 'processing'].includes(order.state)) {
      return failure('INVALID_STATE', 'This order can no longer be cancelled.');
    }
    const occurredAt = this.now().toISOString();
    const immediate = order.state === 'pending_payment';
    const updated: MarketplaceOrder = {
      ...order,
      revision: order.revision + 1,
      state: immediate ? 'cancelled' : 'cancel_requested',
      cancellationReason: command.payload.reason,
      updatedAt: occurredAt,
    };
    if (immediate) this.releaseOrderInventory(order, occurredAt);
    return this.persistOrderAction(
      actorPubky,
      command,
      updated,
      immediate ? 'order.cancelled' : 'order.cancel_requested',
      order.sellerPubky,
      'order_cancelled',
      occurredAt,
    );
  }

  private approveCancellation(actorPubky: string, command: ApproveOrderCancellationCommand): MarketplaceCommandResult {
    const resolved = this.getOrderAction(actorPubky, command.payload.orderId, command);
    if (!resolved.ok) return resolved.failure;
    const order = resolved.order;
    if (order.sellerPubky !== actorPubky) return failure('UNAUTHORIZED', 'Only the seller may approve cancellation.');
    if (order.state !== 'cancel_requested') return failure('INVALID_STATE', 'No cancellation is pending.');
    const occurredAt = this.now().toISOString();
    const updated = { ...order, revision: order.revision + 1, state: 'cancelled' as const, updatedAt: occurredAt };
    this.releaseOrderInventory(order, occurredAt);
    return this.persistOrderAction(
      actorPubky,
      command,
      updated,
      'order.cancelled',
      order.buyerPubky,
      'order_cancelled',
      occurredAt,
    );
  }

  private shipOrder(actorPubky: string, command: ShipOrderCommand): MarketplaceCommandResult {
    const resolved = this.getOrderAction(actorPubky, command.payload.orderId, command);
    if (!resolved.ok) return resolved.failure;
    const order = resolved.order;
    if (order.sellerPubky !== actorPubky) return failure('UNAUTHORIZED', 'Only the seller may ship this order.');
    if (!['paid', 'processing'].includes(order.state))
      return failure('INVALID_STATE', 'The order is not ready to ship.');
    const occurredAt = this.now().toISOString();
    const updated: MarketplaceOrder = {
      ...order,
      revision: order.revision + 1,
      state: 'shipped',
      shipment: {
        carrier: command.payload.carrier,
        trackingNumber: command.payload.trackingNumber,
        state: 'shipped',
        shippedAt: occurredAt,
        deliveredAt: null,
      },
      updatedAt: occurredAt,
    };
    return this.persistOrderAction(
      actorPubky,
      command,
      updated,
      'fulfillment.shipped',
      order.buyerPubky,
      'order_shipped',
      occurredAt,
    );
  }

  private confirmDelivery(actorPubky: string, command: ConfirmOrderDeliveryCommand): MarketplaceCommandResult {
    const resolved = this.getOrderAction(actorPubky, command.payload.orderId, command);
    if (!resolved.ok) return resolved.failure;
    const order = resolved.order;
    if (order.buyerPubky !== actorPubky) return failure('UNAUTHORIZED', 'Only the buyer may confirm delivery.');
    if (order.state !== 'shipped' || !order.shipment) {
      return failure('INVALID_STATE', 'The order is not awaiting delivery confirmation.');
    }
    const occurredAt = this.now().toISOString();
    const updated: MarketplaceOrder = {
      ...order,
      revision: order.revision + 1,
      state: 'delivered',
      shipment: { ...order.shipment, state: 'delivered', deliveredAt: occurredAt },
      updatedAt: occurredAt,
    };
    return this.persistOrderAction(
      actorPubky,
      command,
      updated,
      'fulfillment.delivered',
      order.sellerPubky,
      'order_delivered',
      occurredAt,
    );
  }

  private requestReturn(actorPubky: string, command: RequestReturnCommand): MarketplaceCommandResult {
    const resolved = this.getOrderAction(actorPubky, command.payload.orderId, command);
    if (!resolved.ok) return resolved.failure;
    const order = resolved.order;
    if (order.buyerPubky !== actorPubky) return failure('UNAUTHORIZED', 'Only the buyer may request a return.');
    if (
      !['delivered', 'completed'].includes(order.state) ||
      command.payload.requestedAmountMinor > order.total.amountMinor
    ) {
      return failure('INVALID_STATE', 'The order is not eligible for this return amount.');
    }
    const occurredAt = this.now().toISOString();
    const updated: MarketplaceOrder = {
      ...order,
      revision: order.revision + 1,
      state: 'return_requested',
      returnRequest: {
        state: 'requested',
        reason: command.payload.reason,
        requestedAmountMinor: command.payload.requestedAmountMinor,
        requestedAt: occurredAt,
        updatedAt: occurredAt,
      },
      updatedAt: occurredAt,
    };
    return this.persistOrderAction(
      actorPubky,
      command,
      updated,
      'return.requested',
      order.sellerPubky,
      'return_updated',
      occurredAt,
    );
  }

  private approveReturn(actorPubky: string, command: ApproveReturnCommand): MarketplaceCommandResult {
    const resolved = this.getOrderAction(actorPubky, command.payload.orderId, command);
    if (!resolved.ok) return resolved.failure;
    const order = resolved.order;
    if (order.sellerPubky !== actorPubky) return failure('UNAUTHORIZED', 'Only the seller may approve this return.');
    if (order.state !== 'return_requested' || !order.returnRequest) {
      return failure('INVALID_STATE', 'No return is pending approval.');
    }
    const occurredAt = this.now().toISOString();
    const updated: MarketplaceOrder = {
      ...order,
      revision: order.revision + 1,
      state: 'return_approved',
      returnRequest: { ...order.returnRequest, state: 'approved', updatedAt: occurredAt },
      updatedAt: occurredAt,
    };
    return this.persistOrderAction(
      actorPubky,
      command,
      updated,
      'return.approved',
      order.buyerPubky,
      'return_updated',
      occurredAt,
    );
  }

  private receiveReturn(actorPubky: string, command: ReceiveReturnCommand): MarketplaceCommandResult {
    const resolved = this.getOrderAction(actorPubky, command.payload.orderId, command);
    if (!resolved.ok) return resolved.failure;
    const order = resolved.order;
    if (order.sellerPubky !== actorPubky) return failure('UNAUTHORIZED', 'Only the seller may receive this return.');
    if (order.state !== 'return_approved' || !order.returnRequest) {
      return failure('INVALID_STATE', 'The return is not approved.');
    }
    const occurredAt = this.now().toISOString();
    const updated: MarketplaceOrder = {
      ...order,
      revision: order.revision + 1,
      state: 'return_received',
      returnRequest: { ...order.returnRequest, state: 'received', updatedAt: occurredAt },
      updatedAt: occurredAt,
    };
    return this.persistOrderAction(
      actorPubky,
      command,
      updated,
      'return.received',
      order.buyerPubky,
      'return_updated',
      occurredAt,
    );
  }

  private recordExternalRefund(actorPubky: string, command: RecordExternalRefundCommand): MarketplaceCommandResult {
    const resolved = this.getOrderAction(actorPubky, command.payload.orderId, command);
    if (!resolved.ok) return resolved.failure;
    const order = resolved.order;
    if (order.sellerPubky !== actorPubky) return failure('UNAUTHORIZED', 'Only the seller may record a refund.');
    if (
      !['return_received', 'disputed', 'cancelled'].includes(order.state) ||
      command.payload.amountMinor > order.total.amountMinor ||
      order.externalRefund
    ) {
      return failure('INVALID_STATE', 'The external refund cannot be recorded.');
    }
    const occurredAt = this.now().toISOString();
    const updated: MarketplaceOrder = {
      ...order,
      revision: order.revision + 1,
      state: 'refunded_external',
      externalRefund: {
        amountMinor: command.payload.amountMinor,
        transactionId: command.payload.transactionId,
        recordedAt: occurredAt,
      },
      returnRequest: order.returnRequest
        ? { ...order.returnRequest, state: 'refunded', updatedAt: occurredAt }
        : order.returnRequest,
      updatedAt: occurredAt,
    };
    return this.persistOrderAction(
      actorPubky,
      command,
      updated,
      'refund.recorded_external',
      order.buyerPubky,
      'refund_recorded',
      occurredAt,
    );
  }

  private openDispute(actorPubky: string, command: OpenDisputeCommand): MarketplaceCommandResult {
    const resolved = this.getOrderAction(actorPubky, command.payload.orderId, command);
    if (!resolved.ok) return resolved.failure;
    const order = resolved.order;
    if (
      !['paid', 'processing', 'shipped', 'delivered', 'completed', 'return_requested', 'return_approved'].includes(
        order.state,
      )
    ) {
      return failure('INVALID_STATE', 'This order cannot enter dispute.');
    }
    if (order.dispute) return failure('INVALID_STATE', 'A dispute already exists.');
    const occurredAt = this.now().toISOString();
    const updated: MarketplaceOrder = {
      ...order,
      revision: order.revision + 1,
      state: 'disputed',
      dispute: {
        state: 'open',
        openedBy: actorPubky,
        reason: command.payload.reason,
        requestedRemedy: command.payload.requestedRemedy,
        resolution: null,
        rationale: null,
        openedAt: occurredAt,
        resolvedAt: null,
      },
      updatedAt: occurredAt,
    };
    const recipient = actorPubky === order.buyerPubky ? order.sellerPubky : order.buyerPubky;
    return this.persistOrderAction(
      actorPubky,
      command,
      updated,
      'dispute.opened',
      recipient,
      'dispute_updated',
      occurredAt,
    );
  }

  private resolveDispute(actorPubky: string, command: ResolveDisputeCommand): MarketplaceCommandResult {
    const order = this.repository.getOrder(command.payload.orderId);
    if (!order) return failure('NOT_FOUND', 'The dispute order was not found.');
    if (actorPubky !== MARKETPLACE_SANDBOX_MODERATOR) {
      return failure('UNAUTHORIZED', 'Only the sandbox moderator may resolve disputes.');
    }
    if (
      command.aggregateId !== buildMarketplaceOrderAggregateId(order.id) ||
      command.expectedRevision !== order.revision
    ) {
      return failure('REVISION_CONFLICT', 'The dispute order revision is stale.', { currentRevision: order.revision });
    }
    if (order.state !== 'disputed' || !order.dispute || order.dispute.state !== 'open') {
      return failure('INVALID_STATE', 'No open dispute can be resolved.');
    }
    const occurredAt = this.now().toISOString();
    const buyerRemedy =
      command.payload.resolution === 'buyer_refund' || command.payload.resolution === 'partial_refund';
    const updated: MarketplaceOrder = {
      ...order,
      revision: order.revision + 1,
      state: buyerRemedy ? 'disputed' : 'completed',
      dispute: {
        ...order.dispute,
        state: 'resolved',
        resolution: command.payload.resolution,
        rationale: command.payload.rationale,
        resolvedAt: occurredAt,
      },
      updatedAt: occurredAt,
    };
    this.repository.putOrder(updated);
    const event = this.createEvent(
      actorPubky,
      command,
      updated.revision,
      'dispute.resolved',
      occurredAt,
      buildMarketplaceOrderAggregateId(order.id),
    );
    this.repository.appendEvent(event);
    this.notify(order.buyerPubky, actorPubky, 'dispute_updated', `order:${order.id}`, occurredAt);
    this.notify(order.sellerPubky, actorPubky, 'dispute_updated', `order:${order.id}`, occurredAt);
    return success(command, updated.revision, event.id, { kind: 'order', order: updated });
  }

  private createReview(actorPubky: string, command: CreateReviewCommand): MarketplaceCommandResult {
    const resolved = this.getOrderAction(actorPubky, command.payload.orderId, command);
    if (!resolved.ok) return resolved.failure;
    const order = resolved.order;
    if (!['delivered', 'completed', 'closed'].includes(order.state)) {
      return failure('INVALID_STATE', 'The order is not eligible for review.');
    }
    if (order.reviews.some(({ reviewerPubky }) => reviewerPubky === actorPubky)) {
      return failure('INVALID_STATE', 'This participant already reviewed the order.');
    }
    const occurredAt = this.now().toISOString();
    const review: MarketplaceReview = {
      id: command.commandId,
      reviewerPubky: actorPubky,
      subjectPubky: actorPubky === order.buyerPubky ? order.sellerPubky : order.buyerPubky,
      rating: command.payload.rating,
      text: command.payload.text,
      createdAt: occurredAt,
    };
    const updated: MarketplaceOrder = {
      ...order,
      revision: order.revision + 1,
      state: order.state === 'delivered' ? 'completed' : order.state,
      reviews: [...order.reviews, review],
      updatedAt: occurredAt,
    };
    this.repository.putOrder(updated);
    const event = this.createEvent(actorPubky, command, updated.revision, 'review.created', occurredAt);
    this.repository.appendEvent(event);
    this.notify(review.subjectPubky, actorPubky, 'review_received', `order:${order.id}`, occurredAt);
    return success(command, updated.revision, event.id, { kind: 'review', order: updated, review });
  }

  private createReport(actorPubky: string, command: CreateMarketplaceReportCommand): MarketplaceCommandResult {
    if (command.aggregateId !== `report:${command.commandId}` || command.expectedRevision !== 0) {
      return failure('INVALID_COMMAND', 'The report aggregate identity is invalid.');
    }
    const report: MarketplaceReport = {
      id: command.commandId,
      reporterPubky: actorPubky,
      targetType: command.payload.targetType,
      targetId: command.payload.targetId,
      reason: command.payload.reason,
      details: command.payload.details,
      state: 'open',
      createdAt: this.now().toISOString(),
    };
    this.repository.putReport(report);
    const event = this.createEvent(actorPubky, command, 1, 'trust.reported', report.createdAt);
    this.repository.appendEvent(event);
    return success(command, 1, event.id, { kind: 'report', report });
  }

  private getOrderAction(
    actorPubky: string,
    orderId: string,
    command: MarketplaceCommand,
  ): { ok: true; order: MarketplaceOrder } | { ok: false; failure: MarketplaceCommandFailure } {
    const order = this.repository.getOrder(orderId);
    if (!order) return { ok: false, failure: failure('NOT_FOUND', 'The order was not found.') };
    if (actorPubky !== order.buyerPubky && actorPubky !== order.sellerPubky) {
      return { ok: false, failure: failure('UNAUTHORIZED', 'Only order participants may act on it.') };
    }
    if (command.aggregateId !== buildMarketplaceOrderAggregateId(order.id)) {
      return { ok: false, failure: failure('INVALID_COMMAND', 'The order aggregate id is invalid.') };
    }
    if (command.expectedRevision !== order.revision) {
      return {
        ok: false,
        failure: failure('REVISION_CONFLICT', 'The order revision is stale.', { currentRevision: order.revision }),
      };
    }
    return { ok: true, order };
  }

  private persistOrderAction(
    actorPubky: string,
    command: MarketplaceCommand,
    order: MarketplaceOrder,
    eventKind: MarketplaceEvent['kind'],
    notificationRecipient: string,
    notificationType: MarketplaceNotification['type'],
    occurredAt: string,
  ): MarketplaceCommandResult {
    this.repository.putOrder(order);
    const event = this.createEvent(
      actorPubky,
      command,
      order.revision,
      eventKind,
      occurredAt,
      buildMarketplaceOrderAggregateId(order.id),
    );
    this.repository.appendEvent(event);
    this.notify(notificationRecipient, actorPubky, notificationType, `order:${order.id}`, occurredAt);
    return success(command, order.revision, event.id, { kind: 'order', order });
  }

  private releaseOrderInventory(order: MarketplaceOrder, occurredAt: string): void {
    for (const line of order.lines) {
      const listing = this.repository.getListing(line.listingAggregateId);
      if (!listing) continue;
      this.repository.putListing({
        ...listing,
        serverRevision: listing.serverRevision + 1,
        state: 'available',
        availableQuantity: listing.availableQuantity + line.quantity,
        reservedQuantity: Math.max(0, listing.reservedQuantity - line.quantity),
        updatedAt: occurredAt,
      });
    }
  }

  private notify(
    recipientPubky: string,
    actorPubky: string,
    type: MarketplaceNotification['type'],
    aggregateId: string,
    createdAt: string,
  ): void {
    const preferences = this.getNotificationPreferences(recipientPubky);
    const enabled = [
      'order_created',
      'payment_confirmed',
      'order_cancelled',
      'order_shipped',
      'order_delivered',
      'return_updated',
      'refund_recorded',
      'dispute_updated',
      'review_received',
    ].includes(type)
      ? true
      : type === 'message_received'
        ? preferences.messages
        : type === 'outbid'
          ? preferences.bids
          : type === 'auction_won' || type === 'auction_ended'
            ? preferences.auctions
            : preferences.offers;
    if (!enabled) return;
    this.repository.appendNotification({
      id: randomUUID(),
      revision: 1,
      recipientPubky,
      actorPubky,
      type,
      aggregateId,
      createdAt,
      readAt: null,
    });
  }

  private createEvent(
    actorPubky: string,
    command: MarketplaceCommand,
    revision: number,
    kind: MarketplaceEvent['kind'],
    occurredAt: string,
    aggregateId = command.aggregateId,
  ): MarketplaceEvent {
    return {
      id: randomUUID(),
      commandId: command.commandId,
      aggregateId,
      revision,
      actorPubky,
      kind,
      occurredAt,
    };
  }
}

function success(
  command: MarketplaceCommand,
  revision: number,
  eventIds: string | string[],
  result: MarketplaceCommandSuccess['result'],
): MarketplaceCommandSuccess {
  return {
    ok: true,
    version: 1,
    commandId: command.commandId,
    aggregateId: command.aggregateId,
    revision,
    eventIds: Array.isArray(eventIds) ? eventIds : [eventIds],
    result,
  };
}

function failure(
  code: MarketplaceCommandFailure['error']['code'],
  message: string,
  details: Pick<MarketplaceCommandFailure['error'], 'currentRevision' | 'issues'> = {},
): MarketplaceCommandFailure {
  return { ok: false, error: { code, message, ...details } };
}

function hashCommand(command: MarketplaceCommand): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

function sameAsset(
  left: MarketplaceListingAggregate['unitPrice'],
  right: MarketplaceListingAggregate['unitPrice'],
): boolean {
  return left.currency === right.currency && left.exponent === right.exponent;
}

function latestBidderMaximums(bids: MarketplaceBid[]): Map<string, MarketplaceBid> {
  const latest = new Map<string, MarketplaceBid>();
  for (const bid of bids) {
    const current = latest.get(bid.bidderPubky);
    if (
      !current ||
      bid.maximumAmount.amountMinor > current.maximumAmount.amountMinor ||
      (bid.maximumAmount.amountMinor === current.maximumAmount.amountMinor && bid.sequence < current.sequence)
    ) {
      latest.set(bid.bidderPubky, bid);
    }
  }
  return latest;
}

function hasImageSignature(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (mimeType === 'image/webp') {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    );
  }
  return false;
}

function toAttachmentMetadata(attachment: MarketplaceStoredAttachment): MarketplaceAttachmentMetadata {
  return {
    id: attachment.id,
    senderPubky: attachment.senderPubky,
    recipientPubky: attachment.recipientPubky,
    mimeType: attachment.mimeType,
    byteSize: attachment.byteSize,
    contentHash: attachment.contentHash,
    createdAt: attachment.createdAt,
  };
}
