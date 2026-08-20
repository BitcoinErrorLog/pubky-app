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
import { AuthErrorCode, ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import {
  type MarketplaceListingProjection,
  marketplaceListingProjectionSchema,
  type MarketplaceNotification,
  marketplaceNotificationSchema,
  type MarketplaceOffer,
  marketplaceOfferSchema,
  type MarketplaceOrder,
  marketplaceOrderSchema,
  type MarketplacePayment,
  marketplacePaymentSchema,
  type MarketplaceReceipt,
  marketplaceReceiptSchema,
} from './marketplace-projections';
import {
  type MarketplaceReport,
  marketplaceReportSchema,
  MarketplaceTransactionService,
} from './marketplace-transaction';

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

const notificationPreferencesSchema = z.object({
  ownerPubky: commercePubkySchema,
  revision: z.number().int().nonnegative(),
  messages: z.boolean(),
  offers: z.boolean(),
  bids: z.boolean(),
  auctions: z.boolean(),
  updatedAt: z.string(),
});

export type MarketplaceConversation = z.infer<typeof conversationSchema>;
export type MarketplaceNotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type MarketplaceAttachmentMetadata = z.infer<typeof attachmentMetadataSchema>;
export type {
  MarketplaceListingProjection,
  MarketplaceNotification,
  MarketplaceOffer,
  MarketplaceOrder,
  MarketplacePayment,
  MarketplaceReceipt,
} from './marketplace-projections';
export type { MarketplaceReport } from './marketplace-transaction';

/**
 * Facade over the two marketplace transports, selected by `commerceAdapterMode`:
 *
 * - `sandbox`: the in-memory prototype service. Trust-me `x-pubky-actor`
 *   header, camelCase wire, full query surface. Simulated outcomes.
 * - `transaction-service`: the durable Rust service (see
 *   `MarketplaceTransactionService`). Bearer sessions from Pubky AuthTokens,
 *   snake_case wire, the ported command set plus role-scoped projection
 *   reads (listings, offers, orders, payments, receipts, notifications,
 *   reports). Authoritative outcomes.
 * - anything else fails closed before any bytes leave the client.
 *
 * Sandbox-only surfaces with NO durable counterpart keep their explicit
 * sandbox assertion in every other mode: conversations/messages and
 * attachments (no durable tables; `message.*` commands unported) and
 * notification preferences (`notification.*` commands unported).
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

  /**
   * Listing/inventory projection. The durable service serves it to any
   * authenticated user (public catalog data behind the bearer session), so
   * that mode needs the signed-in actor to bind the session; the sandbox
   * endpoint is unauthenticated and ignores the actor.
   */
  static async getListing(actor: string | null, aggregateId: string): Promise<MarketplaceListingProjection | null> {
    if (getCommerceAdapterMode() === 'transaction-service') {
      return await MarketplaceTransactionService.getListing(this.requireActor('getListing', actor), aggregateId);
    }
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/listings?aggregateId=${encodeURIComponent(aggregateId)}`;
    const response = await safeFetch(url, { method: 'GET' }, ErrorService.Marketplace, 'getListing');
    if (response.status === 404) return null;
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getListing', url);
    const parsed = marketplaceListingProjectionSchema.safeParse(raw);
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
    if (getCommerceAdapterMode() === 'transaction-service') {
      return await MarketplaceTransactionService.getOffers(actor);
    }
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/offers`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { 'x-pubky-actor': actor } },
      ErrorService.Marketplace,
      'getOffers',
    );
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getOffers', url);
    const parsed = z.object({ offers: z.array(marketplaceOfferSchema) }).safeParse(raw);
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
    if (getCommerceAdapterMode() === 'transaction-service') {
      return await MarketplaceTransactionService.getNotifications(actor);
    }
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/notifications`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { 'x-pubky-actor': actor } },
      ErrorService.Marketplace,
      'getNotifications',
    );
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getNotifications', url);
    const parsed = z.object({ notifications: z.array(marketplaceNotificationSchema) }).safeParse(raw);
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
    if (getCommerceAdapterMode() === 'transaction-service') {
      return await MarketplaceTransactionService.getOrders(actor);
    }
    this.assertSandbox();
    const url = `${getMarketplaceUrl()}/v1/orders`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { 'x-pubky-actor': actor } },
      ErrorService.Marketplace,
      'getOrders',
    );
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getOrders', url);
    const parsed = z.object({ orders: z.array(marketplaceOrderSchema) }).safeParse(raw);
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
    if (getCommerceAdapterMode() === 'transaction-service') {
      return await MarketplaceTransactionService.getPayment(actor, paymentId);
    }
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
    const parsed = marketplacePaymentSchema.safeParse(raw);
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
    if (getCommerceAdapterMode() === 'transaction-service') {
      return await MarketplaceTransactionService.getReceipt(actor, receiptId);
    }
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
    const parsed = marketplaceReceiptSchema.safeParse(raw);
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

  /**
   * The durable service authenticates every projection read, so a read
   * without a signed-in pubky can never be satisfied — fail with the same
   * session guidance the transport gives, before any bytes leave the client.
   */
  private static requireActor(operation: string, actor: string | null): string {
    if (actor) return actor;
    throw Err.auth(
      AuthErrorCode.SESSION_EXPIRED,
      'A marketplace session is required. Sign in and approve the marketplace connection on your signer.',
      { service: ErrorService.Marketplace, operation },
    );
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
