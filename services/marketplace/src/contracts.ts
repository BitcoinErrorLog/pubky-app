import { z } from 'zod';
import {
  commerceEntityIdSchema,
  commercePositiveMoneySchema,
  commercePubkySchema,
  createCommerceCommandSchema,
} from '../../../src/libs/commerce/transaction-contracts';

export const registerListingCommandSchema = createCommerceCommandSchema(
  'listing.register',
  z
    .object({
      sellerPubky: commercePubkySchema,
      listingId: commerceEntityIdSchema,
      listingRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      quantity: z.number().int().positive().max(1_000_000),
      unitPrice: commercePositiveMoneySchema,
    })
    .strict(),
);

export const reserveInventoryCommandSchema = createCommerceCommandSchema(
  'inventory.reserve',
  z
    .object({
      quantity: z.number().int().positive().max(1_000_000),
      reservationTtlSeconds: z.number().int().min(60).max(1_800),
    })
    .strict(),
);

export const marketplaceCommandSchema = z.union([registerListingCommandSchema, reserveInventoryCommandSchema]);

export type RegisterListingCommand = z.infer<typeof registerListingCommandSchema>;
export type ReserveInventoryCommand = z.infer<typeof reserveInventoryCommandSchema>;
export type MarketplaceCommand = z.infer<typeof marketplaceCommandSchema>;

export function buildMarketplaceListingAggregateId(sellerPubky: string, listingId: string): string {
  return `listing:${sellerPubky}_${listingId}`;
}
