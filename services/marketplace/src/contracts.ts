import { z } from 'zod';
import {
  commerceEntityIdSchema,
  commercePositiveMoneySchema,
  commercePubkySchema,
  createCommerceCommandSchema,
} from '../../../src/libs/commerce/transaction-contracts';

const auctionTermsSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    minimumIncrement: commercePositiveMoneySchema,
    reservePrice: commercePositiveMoneySchema.optional(),
    antiSnipingWindowSeconds: z.number().int().min(0).max(3_600),
    antiSnipingExtensionSeconds: z.number().int().min(0).max(3_600),
  })
  .strict();

const registerListingPayloadSchema = z
  .object({
    sellerPubky: commercePubkySchema,
    listingId: commerceEntityIdSchema,
    listingRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    quantity: z.number().int().positive().max(1_000_000),
    unitPrice: commercePositiveMoneySchema,
    saleFormat: z.enum(['fixed_price', 'auction']).default('fixed_price'),
    auctionTerms: auctionTermsSchema.optional(),
  })
  .strict()
  .superRefine((payload, context) => {
    if ((payload.saleFormat === 'auction') !== (payload.auctionTerms !== undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['auctionTerms'],
        message: 'Auction format and terms must be configured together.',
      });
    }
    if (payload.auctionTerms) {
      if (Date.parse(payload.auctionTerms.endsAt) <= Date.parse(payload.auctionTerms.startsAt)) {
        context.addIssue({
          code: 'custom',
          path: ['auctionTerms', 'endsAt'],
          message: 'Auction end must follow start.',
        });
      }
      for (const price of [payload.auctionTerms.minimumIncrement, payload.auctionTerms.reservePrice]) {
        if (price && (price.currency !== payload.unitPrice.currency || price.exponent !== payload.unitPrice.exponent)) {
          context.addIssue({
            code: 'custom',
            path: ['auctionTerms'],
            message: 'Auction amounts must use the listing asset and exponent.',
          });
        }
      }
    }
  });

export const registerListingCommandSchema = createCommerceCommandSchema(
  'listing.register',
  registerListingPayloadSchema,
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

export const placeBidCommandSchema = createCommerceCommandSchema(
  'auction.place_bid',
  z.object({ maximumAmount: commercePositiveMoneySchema }).strict(),
);

export const marketplaceCommandSchema = z.union([
  registerListingCommandSchema,
  reserveInventoryCommandSchema,
  createOfferCommandSchema,
  counterOfferCommandSchema,
  acceptOfferCommandSchema,
  rejectOfferCommandSchema,
  withdrawOfferCommandSchema,
  placeBidCommandSchema,
]);

export type RegisterListingCommand = z.infer<typeof registerListingCommandSchema>;
export type ReserveInventoryCommand = z.infer<typeof reserveInventoryCommandSchema>;
export type CreateOfferCommand = z.infer<typeof createOfferCommandSchema>;
export type CounterOfferCommand = z.infer<typeof counterOfferCommandSchema>;
export type AcceptOfferCommand = z.infer<typeof acceptOfferCommandSchema>;
export type RejectOfferCommand = z.infer<typeof rejectOfferCommandSchema>;
export type WithdrawOfferCommand = z.infer<typeof withdrawOfferCommandSchema>;
export type PlaceBidCommand = z.infer<typeof placeBidCommandSchema>;
export type MarketplaceCommand = z.infer<typeof marketplaceCommandSchema>;

export function buildMarketplaceListingAggregateId(sellerPubky: string, listingId: string): string {
  return `listing:${sellerPubky}_${listingId}`;
}

export function buildMarketplaceOfferAggregateId(offerId: string): string {
  return `offer:${offerId}`;
}
