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
        createdAt: z.string(),
      }),
    ),
  })
  .passthrough();

const notificationSchema = z
  .object({
    id: z.uuid(),
    recipientPubky: commercePubkySchema,
    actorPubky: commercePubkySchema,
    type: z.enum([
      'message_received',
      'offer_received',
      'offer_countered',
      'offer_accepted',
      'offer_rejected',
      'outbid',
    ]),
    aggregateId: z.string(),
    createdAt: z.string(),
    readAt: z.string().nullable(),
  })
  .passthrough();

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

export type MarketplaceListingProjection = z.infer<typeof listingProjectionSchema>;
export type MarketplaceConversation = z.infer<typeof conversationSchema>;
export type MarketplaceNotification = z.infer<typeof notificationSchema>;
export type MarketplaceOffer = z.infer<typeof offerSchema>;

export class MarketplaceGatewayService {
  private constructor() {}

  static async execute(actor: string, command: MarketplaceCommand): Promise<MarketplaceCommandResponse> {
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

  private static assertSandbox(): void {
    if (getCommerceAdapterMode() !== 'sandbox') {
      throw Err.client(ClientErrorCode.BAD_REQUEST, 'Sandbox marketplace commands are disabled.', {
        service: ErrorService.Marketplace,
        operation: 'assertSandbox',
      });
    }
  }
}
