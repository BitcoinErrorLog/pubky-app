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

const offerTermsSchema = z
  .object({
    amount: commercePositiveMoneySchema,
    quantity: z.number().int().positive().max(1_000_000),
    expiresInSeconds: z
      .number()
      .int()
      .min(300)
      .max(7 * 24 * 60 * 60),
    message: z.string().trim().max(500),
  })
  .strict();

export const createOfferCommandSchema = createCommerceCommandSchema('offer.create', offerTermsSchema);

export const counterOfferCommandSchema = createCommerceCommandSchema(
  'offer.counter',
  offerTermsSchema.extend({ offerId: z.uuid() }).strict(),
);

const offerActionSchema = z.object({ offerId: z.uuid() }).strict();

export const acceptOfferCommandSchema = createCommerceCommandSchema('offer.accept', offerActionSchema);
export const rejectOfferCommandSchema = createCommerceCommandSchema('offer.reject', offerActionSchema);
export const withdrawOfferCommandSchema = createCommerceCommandSchema('offer.withdraw', offerActionSchema);

export const marketplaceCommandSchema = z.union([
  registerListingCommandSchema,
  reserveInventoryCommandSchema,
  createOfferCommandSchema,
  counterOfferCommandSchema,
  acceptOfferCommandSchema,
  rejectOfferCommandSchema,
  withdrawOfferCommandSchema,
]);

export type RegisterListingCommand = z.infer<typeof registerListingCommandSchema>;
export type ReserveInventoryCommand = z.infer<typeof reserveInventoryCommandSchema>;
export type CreateOfferCommand = z.infer<typeof createOfferCommandSchema>;
export type CounterOfferCommand = z.infer<typeof counterOfferCommandSchema>;
export type AcceptOfferCommand = z.infer<typeof acceptOfferCommandSchema>;
export type RejectOfferCommand = z.infer<typeof rejectOfferCommandSchema>;
export type WithdrawOfferCommand = z.infer<typeof withdrawOfferCommandSchema>;
export type MarketplaceCommand = z.infer<typeof marketplaceCommandSchema>;

export function buildMarketplaceListingAggregateId(sellerPubky: string, listingId: string): string {
  return `listing:${sellerPubky}_${listingId}`;
}

export function buildMarketplaceOfferAggregateId(offerId: string): string {
  return `offer:${offerId}`;
}
