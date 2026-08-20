import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { getCommerceAdapterMode, getMarketplaceUrl } from '@/config/commerce';
import {
  type MarketplaceCommand,
  type MarketplaceCommandResponse,
  marketplaceCommandResponseSchema,
} from '@/libs/commerce/transaction-commands';
import { commercePubkySchema } from '@/libs/commerce/transaction-contracts';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import {
  type MarketplaceReport,
  marketplaceReportSchema,
  MarketplaceTransactionService,
} from './marketplace-transaction';

const listingProjectionSchema = z
  .object({
    aggregateId: z.string(),
    sellerPubky: commercePubkySchema,
    listingId: z.string(),
    serverRevision: z.number().int().positive(),
    state: z.enum(['available', 'reserved', 'sold']),
    availableQuantity: z.number().int().nonnegative(),
    reservedQuantity: z.number().int().nonnegative(),
    unitPrice: z.object({ amountMinor: z.number().int(), currency: z.string(), exponent: z.number().int() }),
    saleFormat: z.enum(['fixed_price', 'auction']),
    auction: z
      .object({
        startsAt: z.string(),
        endsAt: z.string(),
        minimumIncrement: z.object({ amountMinor: z.number().int(), currency: z.string(), exponent: z.number().int() }),
        currentPrice: z.object({ amountMinor: z.number().int(), currency: z.string(), exponent: z.number().int() }),
        leaderPubky: commercePubkySchema.nullable(),
        bidCount: z.number().int().nonnegative(),
        reserveMet: z.boolean(),
      })
      .passthrough()
      .nullable(),
  })
  .passthrough();

const conversationSchema = z
  .object({
    id: z.string(),
    listingAggregateId: z.string(),
    sellerPubky: commercePubkySchema,
    buyerPubky: commercePubkySchema,
    revision: z.number().int().positive(),
    lastMessageAt: z.string(),
    messages: z.array(
      z.object({
        id: z.uuid(),
        senderPubky: commercePubkySchema,
        recipientPubky: commercePubkySchema,
        text: z.string(),
        attachments: z.array(
          z.object({
            id: z.uuid(),
            senderPubky: commercePubkySchema,
            recipientPubky: commercePubkySchema,
            mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
            byteSize: z.number().int().positive(),
            contentHash: z.string().regex(/^[a-f0-9]{64}$/),
            createdAt: z.string(),
          }),
        ),
        createdAt: z.string(),
      }),
    ),
  })
  .passthrough();

const attachmentMetadataSchema = z.object({
  id: z.uuid(),
  senderPubky: commercePubkySchema,
  recipientPubky: commercePubkySchema,
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z.number().int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string(),
});

const notificationSchema = z
  .object({
    id: z.uuid(),
    // Absent from the durable service: delivered notifications are immutable
    // outbox rows, not revisioned aggregates. The sandbox models them with a
    // revision, so this stays optional rather than required.
    revision: z.number().int().positive().optional(),
    recipientPubky: commercePubkySchema,
    actorPubky: commercePubkySchema,
    type: z.enum([
      'message_received',
      'offer_received',
      'offer_countered',
      'offer_accepted',
      'offer_rejected',
      'outbid',
      'auction_won',
      'auction_ended',
      'order_created',
      'payment_confirmed',
      'order_cancelled',
      'order_shipped',
      'order_delivered',
      'return_updated',
      'refund_recorded',
      'dispute_updated',
      'review_received',
    ]),
    aggregateId: z.string(),
    createdAt: z.string(),
    readAt: z.string().nullable(),
  })
  .passthrough();

const notificationPreferencesSchema = z.object({
  ownerPubky: commercePubkySchema,
  revision: z.number().int().nonnegative(),
  messages: z.boolean(),
  offers: z.boolean(),
  bids: z.boolean(),
  auctions: z.boolean(),
  updatedAt: z.string(),
});

const offerSchema = z
  .object({
    id: z.uuid(),
    aggregateId: z.string(),
    listingAggregateId: z.string(),
    buyerPubky: commercePubkySchema,
    sellerPubky: commercePubkySchema,
    revision: z.number().int().positive(),
    state: z.enum(['pending', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired']),
    offeredBy: commercePubkySchema,
    amount: z.object({ amountMinor: z.number().int(), currency: z.string(), exponent: z.number().int() }),
    quantity: z.number().int().positive(),
    message: z.string(),
    expiresAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

const moneySchema = z.object({ amountMinor: z.number().int(), currency: z.string(), exponent: z.number().int() });

const orderSchema = z
  .object({
    id: z.uuid(),
    buyerPubky: commercePubkySchema,
    sellerPubky: commercePubkySchema,
    revision: z.number().int().positive(),
    state: z.enum([
      'pending_payment',
      'paid',
      'processing',
      'shipped',
      'delivered',
      'completed',
      'cancel_requested',
      'cancelled',
      'return_requested',
      'return_approved',
      'return_received',
      'disputed',
      'refunded_external',
      'closed',
    ]),
    lines: z.array(
      z.object({
        listingAggregateId: z.string(),
        listingRevision: z.number().int().positive(),
        contentHash: z.string(),
        title: z.string(),
        quantity: z.number().int().positive(),
        unitPrice: moneySchema,
        subtotal: moneySchema,
      }),
    ),
    subtotal: moneySchema,
    shipping: moneySchema,
    tax: moneySchema,
    total: moneySchema,
    guaranteePolicyVersion: z.literal(1),
    paymentId: z.uuid(),
    receiptId: z.uuid().nullable(),
    cancellationReason: z.string().nullable().optional(),
    shipment: z
      .object({
        carrier: z.string(),
        trackingNumber: z.string(),
        state: z.enum(['shipped', 'delivered']),
        shippedAt: z.string(),
        deliveredAt: z.string().nullable(),
      })
      .nullable()
      .optional(),
    returnRequest: z
      .object({
        state: z.enum(['requested', 'approved', 'received', 'refunded']),
        reason: z.string(),
        requestedAmountMinor: z.number().int().positive(),
        requestedAt: z.string(),
        updatedAt: z.string(),
      })
      .nullable()
      .optional(),
    externalRefund: z
      .object({ amountMinor: z.number().int().positive(), transactionId: z.string(), recordedAt: z.string() })
      .nullable()
      .optional(),
    dispute: z
      .object({
        state: z.enum(['open', 'resolved']),
        openedBy: commercePubkySchema,
        reason: z.string(),
        requestedRemedy: z.enum(['refund', 'partial_refund', 'replacement', 'other']),
        resolution: z.enum(['buyer_refund', 'partial_refund', 'seller_favor', 'replacement']).nullable(),
        rationale: z.string().nullable(),
        openedAt: z.string(),
        resolvedAt: z.string().nullable(),
      })
      .nullable()
      .optional(),
    reviews: z
      .array(
        z.object({
          id: z.uuid(),
          reviewerPubky: commercePubkySchema,
          subjectPubky: commercePubkySchema,
          rating: z.number().int().min(1).max(5),
          text: z.string(),
          createdAt: z.string(),
        }),
      )
      .optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

const paymentSchema = z
  .object({
    id: z.uuid(),
    orderId: z.uuid(),
    buyerPubky: commercePubkySchema,
    sellerPubky: commercePubkySchema,
    revision: z.number().int().positive(),
    adapter: z.literal('sandbox'),
    state: z.enum(['awaiting_entitlement', 'detected', 'confirmed', 'expired', 'manual_review']),
    confirmations: z.number().int().min(0).max(6),
    // Withheld by the durable service: a bundle id is bearer material, so
    // ADR-0019 section 8 keeps it out of read projections. The sandbox still
    // sends it, hence optional rather than removed.
    locksBundleId: z.uuid().optional(),
    amount: moneySchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

const receiptSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  paymentId: z.uuid(),
  issuerPubky: commercePubkySchema,
  recipientPubky: commercePubkySchema,
  total: moneySchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.string(),
});

export type MarketplaceListingProjection = z.infer<typeof listingProjectionSchema>;
export type MarketplaceConversation = z.infer<typeof conversationSchema>;
export type MarketplaceNotification = z.infer<typeof notificationSchema>;
export type MarketplaceOffer = z.infer<typeof offerSchema>;
export type MarketplaceNotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type MarketplaceAttachmentMetadata = z.infer<typeof attachmentMetadataSchema>;
export type MarketplaceOrder = z.infer<typeof orderSchema>;
export type MarketplacePayment = z.infer<typeof paymentSchema>;
export type MarketplaceReceipt = z.infer<typeof receiptSchema>;
export type { MarketplaceReport } from './marketplace-transaction';

/**
 * Facade over the two marketplace transports, selected by `commerceAdapterMode`:
 *
 * - `sandbox`: the in-memory prototype service. Trust-me `x-pubky-actor`
 *   header, camelCase wire, full query surface. Simulated outcomes.
 * - `transaction-service`: the durable Rust service (see
 *   `MarketplaceTransactionService`). Bearer sessions from Pubky AuthTokens,
 *   snake_case wire, commands and reports only. Authoritative outcomes.
 * - anything else fails closed before any bytes leave the client.
 *
 * The sandbox-only query projections (listings, conversations, offers,
 * notifications, orders, payments, receipts, attachments) have no counterpart
 * on the durable service and keep their explicit sandbox assertion.
 */
export class MarketplaceGatewayService {
  private constructor() {}

  static async execute(actor: string, command: MarketplaceCommand): Promise<MarketplaceCommandResponse> {
    if (getCommerceAdapterMode() === 'transaction-service') {
      return await MarketplaceTransactionService.execute(actor, command);
    }
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/commands`;
    const response = await safeFetch(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-pubky-actor': actor,
        },
        body: JSON.stringify(command),
      },
      ErrorService.Marketplace,
      'execute',
    );
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'execute', url);
    const parsed = marketplaceCommandResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned an invalid command response.', {
        service: ErrorService.Marketplace,
        operation: 'execute',
        context: { statusCode: response.status },
      });
    }
    return parsed.data;
  }

  static async getListing(aggregateId: string): Promise<MarketplaceListingProjection | null> {
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/listings?aggregateId=${encodeURIComponent(aggregateId)}`;
    const response = await safeFetch(url, { method: 'GET' }, ErrorService.Marketplace, 'getListing');
    if (response.status === 404) return null;
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getListing', url);
    const parsed = listingProjectionSchema.safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned an invalid listing projection.', {
        service: ErrorService.Marketplace,
        operation: 'getListing',
        context: { statusCode: response.status },
      });
    }
    return parsed.data;
  }

  static async getConversations(actor: string): Promise<MarketplaceConversation[]> {
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/conversations`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { 'x-pubky-actor': actor } },
      ErrorService.Marketplace,
      'getConversations',
    );
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getConversations', url);
    const parsed = z.object({ conversations: z.array(conversationSchema) }).safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned invalid conversations.', {
        service: ErrorService.Marketplace,
        operation: 'getConversations',
        context: { statusCode: response.status },
      });
    }
    return parsed.data.conversations;
  }

  static async getOffers(actor: string): Promise<MarketplaceOffer[]> {
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/offers`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { 'x-pubky-actor': actor } },
      ErrorService.Marketplace,
      'getOffers',
    );
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getOffers', url);
    const parsed = z.object({ offers: z.array(offerSchema) }).safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned invalid offers.', {
        service: ErrorService.Marketplace,
        operation: 'getOffers',
        context: { statusCode: response.status },
      });
    }
    return parsed.data.offers;
  }

  static async getNotifications(actor: string): Promise<MarketplaceNotification[]> {
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/notifications`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { 'x-pubky-actor': actor } },
      ErrorService.Marketplace,
      'getNotifications',
    );
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getNotifications', url);
    const parsed = z.object({ notifications: z.array(notificationSchema) }).safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned invalid notifications.', {
        service: ErrorService.Marketplace,
        operation: 'getNotifications',
        context: { statusCode: response.status },
      });
    }
    return parsed.data.notifications;
  }

  static async getNotificationPreferences(actor: string): Promise<MarketplaceNotificationPreferences> {
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/notification-preferences`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { 'x-pubky-actor': actor } },
      ErrorService.Marketplace,
      'getNotificationPreferences',
    );
    const raw = await parseResponseOrThrow<unknown>(
      response,
      ErrorService.Marketplace,
      'getNotificationPreferences',
      url,
    );
    const parsed = notificationPreferencesSchema.safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned invalid notification preferences.', {
        service: ErrorService.Marketplace,
        operation: 'getNotificationPreferences',
        context: { statusCode: response.status },
      });
    }
    return parsed.data;
  }

  static async getOrders(actor: string): Promise<MarketplaceOrder[]> {
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/orders`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { 'x-pubky-actor': actor } },
      ErrorService.Marketplace,
      'getOrders',
    );
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getOrders', url);
    const parsed = z.object({ orders: z.array(orderSchema) }).safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned invalid orders.', {
        service: ErrorService.Marketplace,
        operation: 'getOrders',
        context: { statusCode: response.status },
      });
    }
    return parsed.data.orders;
  }

  static async getPayment(actor: string, paymentId: string): Promise<MarketplacePayment | null> {
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/payments/${encodeURIComponent(paymentId)}`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { 'x-pubky-actor': actor } },
      ErrorService.Marketplace,
      'getPayment',
    );
    if (response.status === 404) return null;
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getPayment', url);
    const parsed = paymentSchema.safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned an invalid payment.', {
        service: ErrorService.Marketplace,
        operation: 'getPayment',
        context: { statusCode: response.status },
      });
    }
    return parsed.data;
  }

  static async getReceipt(actor: string, receiptId: string): Promise<MarketplaceReceipt | null> {
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/receipts/${encodeURIComponent(receiptId)}`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { 'x-pubky-actor': actor } },
      ErrorService.Marketplace,
      'getReceipt',
    );
    if (response.status === 404) return null;
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getReceipt', url);
    const parsed = receiptSchema.safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned an invalid receipt.', {
        service: ErrorService.Marketplace,
        operation: 'getReceipt',
        context: { statusCode: response.status },
      });
    }
    return parsed.data;
  }

  static async getReports(actor: string): Promise<MarketplaceReport[]> {
    if (getCommerceAdapterMode() === 'transaction-service') {
      return await MarketplaceTransactionService.getReports(actor);
    }
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/reports`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { 'x-pubky-actor': actor } },
      ErrorService.Marketplace,
      'getReports',
    );
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getReports', url);
    const parsed = z.object({ reports: z.array(marketplaceReportSchema) }).safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned invalid moderation reports.', {
        service: ErrorService.Marketplace,
        operation: 'getReports',
        context: { statusCode: response.status },
      });
    }
    return parsed.data.reports;
  }

  static async uploadAttachment(actor: string, recipient: string, file: File): Promise<MarketplaceAttachmentMetadata> {
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/attachments`;
    const response = await safeFetch(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': file.type,
          'x-pubky-actor': actor,
          'x-recipient-pubky': recipient,
        },
        body: file,
      },
      ErrorService.Marketplace,
      'uploadAttachment',
    );
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'uploadAttachment', url);
    const parsed = attachmentMetadataSchema.safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned invalid attachment metadata.', {
        service: ErrorService.Marketplace,
        operation: 'uploadAttachment',
        context: { statusCode: response.status },
      });
    }
    return parsed.data;
  }

  static async fetchAttachment(actor: string, attachmentId: string): Promise<Blob> {
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/attachments/${encodeURIComponent(attachmentId)}`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { 'x-pubky-actor': actor } },
      ErrorService.Marketplace,
      'fetchAttachment',
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const expectedHash = response.headers.get('x-content-hash');
    if (!expectedHash || bytesToHex(blake3(bytes)) !== expectedHash) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace attachment integrity check failed.', {
        service: ErrorService.Marketplace,
        operation: 'fetchAttachment',
        context: { statusCode: response.status },
      });
    }
    return new Blob([bytes], { type: response.headers.get('content-type') ?? 'application/octet-stream' });
  }

  private static assertSandbox(): void {
    if (getCommerceAdapterMode() !== 'sandbox') {
      throw Err.client(ClientErrorCode.BAD_REQUEST, 'Sandbox marketplace commands are disabled.', {
        service: ErrorService.Marketplace,
        operation: 'assertSandbox',
      });
    }
  }
}
