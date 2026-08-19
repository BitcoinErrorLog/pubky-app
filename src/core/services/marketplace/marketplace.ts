import { z } from 'zod';
import { getCommerceAdapterMode, getMarketplaceUrl } from '@/config/commerce';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import {
  marketplaceCommandResponseSchema,
  type MarketplaceCommand,
  type MarketplaceCommandResponse,
} from '@/libs/commerce/transaction-commands';
import { commercePubkySchema } from '@/libs/commerce/transaction-contracts';
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

export type MarketplaceListingProjection = z.infer<typeof listingProjectionSchema>;

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

  private static assertSandbox(): void {
    if (getCommerceAdapterMode() !== 'sandbox') {
      throw Err.client(ClientErrorCode.BAD_REQUEST, 'Sandbox marketplace commands are disabled.', {
        service: ErrorService.Marketplace,
        operation: 'assertSandbox',
      });
    }
  }
}
