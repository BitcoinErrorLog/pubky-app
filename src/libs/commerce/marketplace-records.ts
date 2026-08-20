import { z } from 'zod';
import {
  COMMERCE_CONTRACT_VERSION,
  COMMERCE_LISTING_DESCRIPTION_MAX_CHARS,
  COMMERCE_LISTING_MAX_IMAGES,
  COMMERCE_LISTING_MAX_MEDIA,
  COMMERCE_LISTING_MAX_OPTION_DIMENSIONS,
  COMMERCE_LISTING_MAX_QUANTITY,
  COMMERCE_LISTING_MAX_TAGS,
  COMMERCE_LISTING_MAX_VARIANTS,
  COMMERCE_LISTING_MAX_VIDEOS,
  COMMERCE_LISTING_TITLE_MAX_CHARS,
  COMMERCE_LISTING_TITLE_MIN_CHARS,
  COMMERCE_MEDIA_ALT_TEXT_MAX_CHARS,
  COMMERCE_REVIEW_TEXT_MAX_CHARS,
  COMMERCE_SHOP_BIO_MAX_CHARS,
  COMMERCE_SHOP_NAME_MAX_CHARS,
  COMMERCE_SHOP_POLICY_MAX_CHARS,
  COMMERCE_TAXONOMY_VERSION,
} from '@/config/commerce';
import {
  commerceEntityIdSchema,
  commerceMoneySchema,
  commercePositiveMoneySchema,
  commercePubkySchema,
  commerceTimestampSchema,
} from './transaction-contracts';

const commercePublicRecordBaseSchema = z
  .object({
    schemaVersion: z.literal(COMMERCE_CONTRACT_VERSION),
    ownerPubky: commercePubkySchema,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    createdAt: commerceTimestampSchema,
    updatedAt: commerceTimestampSchema,
  })
  .strict();

export const commerceCountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'Expected an ISO 3166-1 alpha-2 code');

export const commercePublicLocationSchema = z
  .object({
    countryCode: commerceCountryCodeSchema,
    region: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const marketplacePublicUriSchema = z
  .string()
  .regex(
    /^pubky:\/\/[ybndrfg8ejkmcpqxot1uwisza345h769]{52}\/pub\/pubky\.app\/marketplace\/v1\/[A-Za-z0-9_./-]+$/,
    'Expected a Pubky marketplace v1 URI',
  );

export const locksPublicUriSchema = z
  .string()
  .regex(
    /^pubky:\/\/[ybndrfg8ejkmcpqxot1uwisza345h769]{52}\/pub\/locks\.app\/[A-Za-z0-9_./-]+\.json$/,
    'Expected a public Locks policy URI',
  );

export const commerceMediaSchema = z
  .object({
    id: commerceEntityIdSchema,
    type: z.enum(['image', 'video']),
    url: marketplacePublicUriSchema,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/, 'Expected a lowercase BLAKE3 hash'),
    mimeType: z.string().regex(/^(image|video)\/[a-z0-9.+-]+$/i, 'Expected an image or video MIME type'),
    byteSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    durationMs: z.number().int().positive().optional(),
    altText: z.string().trim().min(1).max(COMMERCE_MEDIA_ALT_TEXT_MAX_CHARS),
  })
  .strict()
  .superRefine((media, context) => {
    if (media.type === 'video' && media.durationMs === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Video media requires durationMs',
        path: ['durationMs'],
      });
    }
    if (media.type === 'image' && media.durationMs !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Image media cannot declare durationMs',
        path: ['durationMs'],
      });
    }
  });

export const commerceVariantSchema = z
  .object({
    id: commerceEntityIdSchema,
    sku: z.string().trim().min(1).max(64).optional(),
    options: z.record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(80)),
    priceOverride: commercePositiveMoneySchema.optional(),
    quantity: z.number().int().min(0).max(COMMERCE_LISTING_MAX_QUANTITY),
    mediaIds: z.array(commerceEntityIdSchema).max(COMMERCE_LISTING_MAX_MEDIA).default([]),
    enabled: z.boolean().default(true),
  })
  .strict()
  .superRefine((variant, context) => {
    if (Object.keys(variant.options).length > COMMERCE_LISTING_MAX_OPTION_DIMENSIONS) {
      context.addIssue({
        code: 'custom',
        message: `Variants support at most ${COMMERCE_LISTING_MAX_OPTION_DIMENSIONS} option dimensions`,
        path: ['options'],
      });
    }
  });

const fixedPriceSaleSchema = z
  .object({
    format: z.literal('fixed_price'),
    unitPrice: commercePositiveMoneySchema,
    acceptsOffers: z.boolean(),
  })
  .strict();

const auctionSaleSchema = z
  .object({
    format: z.literal('auction'),
    startingPrice: commercePositiveMoneySchema,
    reservePrice: commercePositiveMoneySchema.optional(),
    buyNowPrice: commercePositiveMoneySchema.optional(),
    minimumIncrement: commercePositiveMoneySchema,
    startsAt: commerceTimestampSchema,
    endsAt: commerceTimestampSchema,
    antiSnipingWindowSeconds: z.number().int().min(0).max(3_600),
    antiSnipingExtensionSeconds: z.number().int().min(0).max(3_600),
  })
  .strict();

export const commerceSaleSchema = z.discriminatedUnion('format', [fixedPriceSaleSchema, auctionSaleSchema]);

const freeShippingOptionSchema = z
  .object({
    id: commerceEntityIdSchema,
    pricing: z.literal('free'),
    label: z.string().trim().min(1).max(100),
    estimatedMinDays: z.number().int().min(0).max(365),
    estimatedMaxDays: z.number().int().min(0).max(365),
  })
  .strict();

const flatShippingOptionSchema = z
  .object({
    id: commerceEntityIdSchema,
    pricing: z.literal('flat'),
    label: z.string().trim().min(1).max(100),
    price: commerceMoneySchema,
    estimatedMinDays: z.number().int().min(0).max(365),
    estimatedMaxDays: z.number().int().min(0).max(365),
  })
  .strict();

const calculatedShippingOptionSchema = z
  .object({
    id: commerceEntityIdSchema,
    pricing: z.literal('calculated'),
    label: z.string().trim().min(1).max(100),
    provider: z.string().trim().min(1).max(50),
    serviceCode: z.string().trim().min(1).max(100),
    estimatedMinDays: z.number().int().min(0).max(365),
    estimatedMaxDays: z.number().int().min(0).max(365),
  })
  .strict();

export const commerceShippingOptionSchema = z
  .discriminatedUnion('pricing', [freeShippingOptionSchema, flatShippingOptionSchema, calculatedShippingOptionSchema])
  .superRefine((option, context) => {
    if (option.estimatedMaxDays < option.estimatedMinDays) {
      context.addIssue({
        code: 'custom',
        message: 'Maximum delivery estimate must not precede the minimum',
        path: ['estimatedMaxDays'],
      });
    }
  });

export const commercePackageSchema = z
  .object({
    weightGrams: z.number().int().positive().max(1_000_000),
    lengthMillimeters: z.number().int().positive().max(100_000),
    widthMillimeters: z.number().int().positive().max(100_000),
    heightMillimeters: z.number().int().positive().max(100_000),
  })
  .strict();

export const commerceReturnPolicySchema = z
  .object({
    acceptsReturns: z.boolean(),
    returnWindowDays: z.number().int().min(1).max(365).optional(),
    buyerPaysReturnShipping: z.boolean(),
    details: z.string().trim().max(COMMERCE_SHOP_POLICY_MAX_CHARS).optional(),
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.acceptsReturns && policy.returnWindowDays === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A return window is required when returns are accepted',
        path: ['returnWindowDays'],
      });
    }
    if (!policy.acceptsReturns && policy.returnWindowDays !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A return window cannot be set when returns are not accepted',
        path: ['returnWindowDays'],
      });
    }
  });

export const commerceDigitalLockSchema = z
  .object({
    policyUri: locksPublicUriSchema,
    criterionId: commerceEntityIdSchema.default('criterion-1'),
    resourceHash: z.string().regex(/^[a-f0-9]{64}$/, 'Expected a lowercase BLAKE3 hash'),
    minimumConfirmations: z.number().int().min(0).max(6),
  })
  .strict();

export const commerceShopRecordSchema = commercePublicRecordBaseSchema
  .extend({
    recordType: z.literal('shop'),
    name: z.string().trim().min(1).max(COMMERCE_SHOP_NAME_MAX_CHARS),
    bio: z.string().trim().max(COMMERCE_SHOP_BIO_MAX_CHARS),
    location: commercePublicLocationSchema,
    avatarUrl: marketplacePublicUriSchema.optional(),
    bannerUrl: marketplacePublicUriSchema.optional(),
    shippingPolicy: z.string().trim().max(COMMERCE_SHOP_POLICY_MAX_CHARS),
    returnPolicy: z.string().trim().max(COMMERCE_SHOP_POLICY_MAX_CHARS),
    vacationMode: z.boolean(),
    createdAt: commerceTimestampSchema,
    updatedAt: commerceTimestampSchema,
  })
  .strict()
  .superRefine(validateRecordDates);

export const commerceListingRecordSchema = commercePublicRecordBaseSchema
  .extend({
    recordType: z.literal('listing'),
    listingId: commerceEntityIdSchema,
    state: z.enum(['active', 'paused', 'ended', 'removed']),
    title: z.string().trim().min(COMMERCE_LISTING_TITLE_MIN_CHARS).max(COMMERCE_LISTING_TITLE_MAX_CHARS),
    description: z.string().trim().min(1).max(COMMERCE_LISTING_DESCRIPTION_MAX_CHARS),
    taxonomyVersion: z.literal(COMMERCE_TAXONOMY_VERSION),
    categoryId: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Expected a kebab-case category id'),
    condition: z.enum(['new', 'like_new', 'excellent', 'good', 'fair', 'for_parts']),
    conditionDetails: z.string().trim().max(1_000).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(COMMERCE_LISTING_MAX_TAGS),
    location: commercePublicLocationSchema,
    media: z.array(commerceMediaSchema).min(1).max(COMMERCE_LISTING_MAX_MEDIA),
    variants: z.array(commerceVariantSchema).min(1).max(COMMERCE_LISTING_MAX_VARIANTS),
    sale: commerceSaleSchema,
    fulfillmentMethods: z
      .array(z.enum(['physical', 'digital', 'pickup']))
      .min(1)
      .max(3),
    package: commercePackageSchema.optional(),
    shippingOptions: z.array(commerceShippingOptionSchema).max(20),
    returnPolicy: commerceReturnPolicySchema,
    digitalLock: commerceDigitalLockSchema.optional(),
    adultOnly: z.boolean(),
  })
  .strict()
  .superRefine((listing, context) => {
    validateRecordDates(listing, context);
    validateUniqueValues(
      listing.media.map(({ id }) => id),
      ['media'],
      'Media ids must be unique',
      context,
    );
    validateUniqueValues(
      listing.variants.map(({ id }) => id),
      ['variants'],
      'Variant ids must be unique',
      context,
    );
    validateUniqueValues(
      listing.variants.flatMap(({ sku }) => (sku ? [sku] : [])),
      ['variants'],
      'Variant SKUs must be unique',
      context,
    );
    validateUniqueValues(listing.tags, ['tags'], 'Tags must be unique', context);
    validateUniqueValues(
      listing.fulfillmentMethods,
      ['fulfillmentMethods'],
      'Fulfillment methods must be unique',
      context,
    );
    validateUniqueValues(
      listing.shippingOptions.map(({ id }) => id),
      ['shippingOptions'],
      'Shipping option ids must be unique',
      context,
    );

    const imageCount = listing.media.filter(({ type }) => type === 'image').length;
    const videoCount = listing.media.filter(({ type }) => type === 'video').length;
    if (imageCount === 0 || imageCount > COMMERCE_LISTING_MAX_IMAGES) {
      context.addIssue({
        code: 'custom',
        message: `Listings require 1-${COMMERCE_LISTING_MAX_IMAGES} images`,
        path: ['media'],
      });
    }
    if (videoCount > COMMERCE_LISTING_MAX_VIDEOS) {
      context.addIssue({
        code: 'custom',
        message: `Listings support at most ${COMMERCE_LISTING_MAX_VIDEOS} video`,
        path: ['media'],
      });
    }

    const mediaIds = new Set(listing.media.map(({ id }) => id));
    listing.variants.forEach((variant, variantIndex) => {
      variant.mediaIds.forEach((mediaId, mediaIndex) => {
        if (!mediaIds.has(mediaId)) {
          context.addIssue({
            code: 'custom',
            message: 'Variant references unknown media',
            path: ['variants', variantIndex, 'mediaIds', mediaIndex],
          });
        }
      });
    });

    if (listing.state === 'active' && !listing.variants.some(({ enabled, quantity }) => enabled && quantity > 0)) {
      context.addIssue({
        code: 'custom',
        message: 'An active listing requires available intended quantity',
        path: ['variants'],
      });
    }

    const hasPhysical = listing.fulfillmentMethods.includes('physical');
    const hasDigital = listing.fulfillmentMethods.includes('digital');
    if (hasPhysical && listing.package === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Physical fulfillment requires package facts',
        path: ['package'],
      });
    }
    if (hasPhysical && listing.shippingOptions.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Physical fulfillment requires a shipping option',
        path: ['shippingOptions'],
      });
    }
    if (!hasPhysical && (listing.package !== undefined || listing.shippingOptions.length > 0)) {
      context.addIssue({
        code: 'custom',
        message: 'Package and shipping options require physical fulfillment',
        path: ['fulfillmentMethods'],
      });
    }
    if (hasDigital !== (listing.digitalLock !== undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'Digital fulfillment and digitalLock must be configured together',
        path: ['digitalLock'],
      });
    }

    if (listing.sale.format === 'auction') {
      validateAuction(listing.sale, context);
      if (listing.variants.length !== 1) {
        context.addIssue({
          code: 'custom',
          message: 'Auction listings require exactly one variant',
          path: ['variants'],
        });
      }
    }

    const primaryMoney = listing.sale.format === 'fixed_price' ? listing.sale.unitPrice : listing.sale.startingPrice;
    listing.variants.forEach((variant, variantIndex) => {
      if (variant.priceOverride && !hasSameAsset(primaryMoney, variant.priceOverride)) {
        context.addIssue({
          code: 'custom',
          message: 'Variant price must use the listing asset and exponent',
          path: ['variants', variantIndex, 'priceOverride'],
        });
      }
    });
    listing.shippingOptions.forEach((option, optionIndex) => {
      if (option.pricing === 'flat' && !hasSameAsset(primaryMoney, option.price)) {
        context.addIssue({
          code: 'custom',
          message: 'Shipping price must use the listing asset and exponent',
          path: ['shippingOptions', optionIndex, 'price'],
        });
      }
    });

    const mediaPrefix = `pubky://${listing.ownerPubky}/pub/pubky.app/marketplace/v1/media/`;
    listing.media.forEach((media, mediaIndex) => {
      if (!media.url.startsWith(mediaPrefix)) {
        context.addIssue({
          code: 'custom',
          message: 'Listing media must be owned by the listing seller',
          path: ['media', mediaIndex, 'url'],
        });
      }
    });
  });

export const commerceReviewRecordSchema = commercePublicRecordBaseSchema
  .extend({
    recordType: z.literal('review'),
    reviewId: commerceEntityIdSchema,
    subjectPubky: commercePubkySchema,
    listingOwnerPubky: commercePubkySchema,
    listingId: commerceEntityIdSchema,
    role: z.enum(['buyer_reviewing_seller', 'seller_reviewing_buyer']),
    ratings: z
      .object({
        overall: z.number().int().min(1).max(5),
        itemAccuracy: z.number().int().min(1).max(5).optional(),
        shipping: z.number().int().min(1).max(5).optional(),
        communication: z.number().int().min(1).max(5).optional(),
      })
      .strict(),
    text: z.string().trim().min(1).max(COMMERCE_REVIEW_TEXT_MAX_CHARS),
    eligibilityAttestation: z
      .string()
      .min(32)
      .max(4_096)
      .regex(/^[A-Za-z0-9._~-]+$/),
  })
  .strict()
  .superRefine(validateRecordDates);

export const commerceCollectionRecordSchema = commercePublicRecordBaseSchema
  .extend({
    recordType: z.literal('collection'),
    collectionId: commerceEntityIdSchema,
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(1_000),
    listingIds: z.array(commerceEntityIdSchema).max(200),
    coverMediaUrl: marketplacePublicUriSchema.optional(),
  })
  .strict()
  .superRefine((collection, context) => {
    validateRecordDates(collection, context);
    validateUniqueValues(collection.listingIds, ['listingIds'], 'Collection listing ids must be unique', context);
  });

export const commerceTombstoneRecordSchema = commercePublicRecordBaseSchema
  .extend({
    recordType: z.literal('tombstone'),
    targetType: z.enum(['shop', 'listing', 'review', 'collection']),
    targetId: commerceEntityIdSchema,
    reason: z.enum(['deleted', 'removed', 'replaced']),
  })
  .strict()
  .superRefine(validateRecordDates);

export const commercePublicRecordSchema = z.union([
  commerceShopRecordSchema,
  commerceListingRecordSchema,
  commerceReviewRecordSchema,
  commerceCollectionRecordSchema,
  commerceTombstoneRecordSchema,
]);

function validateRecordDates(record: { createdAt: string; updatedAt: string }, context: z.RefinementCtx): void {
  if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) {
    context.addIssue({
      code: 'custom',
      message: 'updatedAt must not precede createdAt',
      path: ['updatedAt'],
    });
  }
}

function validateUniqueValues(values: string[], path: PropertyKey[], message: string, context: z.RefinementCtx): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: 'custom', message, path });
  }
}

function hasSameAsset(
  left: { currency: string; exponent: number },
  right: { currency: string; exponent: number },
): boolean {
  return left.currency === right.currency && left.exponent === right.exponent;
}

function validateAuction(auction: z.infer<typeof auctionSaleSchema>, context: z.RefinementCtx): void {
  if (Date.parse(auction.endsAt) <= Date.parse(auction.startsAt)) {
    context.addIssue({
      code: 'custom',
      message: 'Auction end must follow its start',
      path: ['sale', 'endsAt'],
    });
  }

  const prices = [
    ['reservePrice', auction.reservePrice],
    ['buyNowPrice', auction.buyNowPrice],
    ['minimumIncrement', auction.minimumIncrement],
  ] as const;
  for (const [field, price] of prices) {
    if (price && !hasSameAsset(auction.startingPrice, price)) {
      context.addIssue({
        code: 'custom',
        message: 'Auction prices must use one asset and exponent',
        path: ['sale', field],
      });
    }
  }

  if (auction.reservePrice && auction.reservePrice.amountMinor < auction.startingPrice.amountMinor) {
    context.addIssue({
      code: 'custom',
      message: 'Reserve price must not be below the starting price',
      path: ['sale', 'reservePrice'],
    });
  }
  if (auction.buyNowPrice && auction.buyNowPrice.amountMinor <= auction.startingPrice.amountMinor) {
    context.addIssue({
      code: 'custom',
      message: 'Buy-now price must exceed the starting price',
      path: ['sale', 'buyNowPrice'],
    });
  }
}

export type CommerceShopRecord = z.infer<typeof commerceShopRecordSchema>;
export type CommerceListingRecord = z.infer<typeof commerceListingRecordSchema>;
export type CommerceReviewRecord = z.infer<typeof commerceReviewRecordSchema>;
export type CommerceCollectionRecord = z.infer<typeof commerceCollectionRecordSchema>;
export type CommerceTombstoneRecord = z.infer<typeof commerceTombstoneRecordSchema>;
export type CommercePublicRecord = z.infer<typeof commercePublicRecordSchema>;
