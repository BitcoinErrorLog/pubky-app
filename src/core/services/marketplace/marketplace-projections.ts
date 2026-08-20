import { z } from 'zod';
import { commercePubkySchema } from '@/libs/commerce/transaction-contracts';

/**
 * Read-projection schemas shared by BOTH marketplace transports.
 *
 * The sandbox prototype and the durable Rust transaction service now serve
 * the same projection shapes (the durable service's `queries.rs` was written
 * against these), so the schemas live here rather than in either transport
 * module. Divergences between the two services are deliberate and encoded as
 * optional fields with a comment naming which side omits them.
 *
 * Sandbox-only projections with NO durable counterpart (conversations,
 * notification preferences, attachment metadata) stay in `marketplace.ts`
 * next to the sandbox transport that owns them.
 */

export const marketplaceMoneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string(),
  exponent: z.number().int(),
});

export const marketplaceListingProjectionSchema = z
  .object({
    aggregateId: z.string(),
    sellerPubky: commercePubkySchema,
    listingId: z.string(),
    serverRevision: z.number().int().positive(),
    state: z.enum(['available', 'reserved', 'sold']),
    availableQuantity: z.number().int().nonnegative(),
    reservedQuantity: z.number().int().nonnegative(),
    unitPrice: marketplaceMoneySchema,
    saleFormat: z.enum(['fixed_price', 'auction']),
    auction: z
      .object({
        startsAt: z.string(),
        endsAt: z.string(),
        minimumIncrement: marketplaceMoneySchema,
        currentPrice: marketplaceMoneySchema,
        leaderPubky: commercePubkySchema.nullable(),
        bidCount: z.number().int().nonnegative(),
        reserveMet: z.boolean(),
      })
      .passthrough()
      .nullable(),
  })
  .passthrough();

export const marketplaceNotificationSchema = z
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

export const marketplaceOfferSchema = z
  .object({
    id: z.uuid(),
    aggregateId: z.string(),
    listingAggregateId: z.string(),
    buyerPubky: commercePubkySchema,
    sellerPubky: commercePubkySchema,
    revision: z.number().int().positive(),
    state: z.enum(['pending', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired']),
    offeredBy: commercePubkySchema,
    amount: marketplaceMoneySchema,
    quantity: z.number().int().positive(),
    message: z.string(),
    expiresAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

export const marketplacePaymentSchema = z
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
    amount: marketplaceMoneySchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

export const marketplaceOrderSchema = z
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
        unitPrice: marketplaceMoneySchema,
        subtotal: marketplaceMoneySchema,
      }),
    ),
    subtotal: marketplaceMoneySchema,
    shipping: marketplaceMoneySchema,
    tax: marketplaceMoneySchema,
    total: marketplaceMoneySchema,
    guaranteePolicyVersion: z.literal(1),
    paymentId: z.uuid(),
    receiptId: z.uuid().nullable(),
    cancellationReason: z.string().nullable().optional(),
    // Embedded only by the durable service's order reads ("each order with
    // its payment projection"); the sandbox serves payments from a separate
    // endpoint instead.
    payment: marketplacePaymentSchema.optional(),
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
        // Durable service only. Evidence BODIES are never served to anyone
        // (ADR-0019 section 8) — this count is the only visible trace.
        evidenceCount: z.number().int().nonnegative().optional(),
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

export const marketplaceReceiptSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  paymentId: z.uuid(),
  issuerPubky: commercePubkySchema,
  recipientPubky: commercePubkySchema,
  total: marketplaceMoneySchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.string(),
});

export type MarketplaceListingProjection = z.infer<typeof marketplaceListingProjectionSchema>;
export type MarketplaceNotification = z.infer<typeof marketplaceNotificationSchema>;
export type MarketplaceOffer = z.infer<typeof marketplaceOfferSchema>;
export type MarketplaceOrder = z.infer<typeof marketplaceOrderSchema>;
export type MarketplacePayment = z.infer<typeof marketplacePaymentSchema>;
export type MarketplaceReceipt = z.infer<typeof marketplaceReceiptSchema>;
