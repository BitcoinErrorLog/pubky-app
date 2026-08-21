import { z } from 'zod';
import {
  COMMERCE_LISTING_DESCRIPTION_MAX_CHARS,
  COMMERCE_LISTING_TITLE_MAX_CHARS,
  COMMERCE_LISTING_TITLE_MIN_CHARS,
} from '@/config/commerce';

export const CREATE_MARKETPLACE_LISTING_FIELDS = {
  TITLE: 'title',
  DESCRIPTION: 'description',
  CATEGORY: 'categoryId',
  CONDITION: 'condition',
  COUNTRY_CODE: 'countryCode',
  REGION: 'region',
  SALE_FORMAT: 'saleFormat',
  PRICE: 'price',
  VARIANTS: 'variants',
  FULFILLMENT: 'fulfillment',
  SHIPPING_PRICE: 'shippingPrice',
  WEIGHT_GRAMS: 'weightGrams',
  LENGTH_MM: 'lengthMillimeters',
  WIDTH_MM: 'widthMillimeters',
  HEIGHT_MM: 'heightMillimeters',
  RETURN_DAYS: 'returnDays',
} as const;

const moneyInputSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, 'Enter a valid USD amount with at most two decimal places.')
  .refine((value) => Number(value) > 0, 'Price must be greater than zero.');

const listingVariantSchema = z
  .object({
    sku: z.string().trim().max(64, 'SKU must be 64 characters or fewer.'),
    size: z.string().trim().max(80, 'Size is too long.'),
    color: z.string().trim().max(80, 'Color is too long.'),
    style: z.string().trim().max(80, 'Style is too long.'),
    quantity: z
      .string()
      .trim()
      .regex(/^[1-9]\d*$/, 'Quantity must be a positive whole number.')
      .refine((value) => Number(value) <= 1_000_000, 'Quantity is too large.'),
    priceOverride: z.string().trim(),
  })
  .superRefine((variant, context) => {
    if (variant.priceOverride && !moneyInputSchema.safeParse(variant.priceOverride).success) {
      context.addIssue({
        code: 'custom',
        path: ['priceOverride'],
        message: 'Enter a valid price override.',
      });
    }
  });

export const createMarketplaceListingSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(COMMERCE_LISTING_TITLE_MIN_CHARS, 'Title must be at least 3 characters.')
      .max(COMMERCE_LISTING_TITLE_MAX_CHARS, 'Title must be 80 characters or fewer.'),
    description: z
      .string()
      .trim()
      .min(1, 'Description is required.')
      .max(COMMERCE_LISTING_DESCRIPTION_MAX_CHARS, 'Description is too long.'),
    categoryId: z.string().min(1, 'Choose a category.'),
    condition: z.enum(['new', 'like_new', 'excellent', 'good', 'fair', 'for_parts']),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, 'Enter a two-letter country code.'),
    region: z.string().trim().max(100, 'Region is too long.'),
    saleFormat: z.enum(['fixed_price', 'auction']),
    price: moneyInputSchema,
    variants: z.array(listingVariantSchema).min(1, 'Add at least one variant.').max(100, 'Too many variants.'),
    fulfillment: z.enum(['pickup', 'physical']),
    shippingPrice: z.string().trim(),
    weightGrams: z.string().trim(),
    lengthMillimeters: z.string().trim(),
    widthMillimeters: z.string().trim(),
    heightMillimeters: z.string().trim(),
    returnDays: z.enum(['none', '14', '30']),
  })
  .superRefine((data, context) => {
    if (data.fulfillment === 'physical') {
      const shipping = moneyInputSchema.safeParse(data.shippingPrice);
      if (!shipping.success) {
        context.addIssue({
          code: 'custom',
          path: ['shippingPrice'],
          message: shipping.error.issues[0]?.message ?? 'Shipping price is required.',
        });
      }
      if (!/^[1-9]\d*$/.test(data.weightGrams) || Number(data.weightGrams) > 1_000_000) {
        context.addIssue({
          code: 'custom',
          path: ['weightGrams'],
          message: 'Enter a package weight in whole grams.',
        });
      }
      for (const field of ['lengthMillimeters', 'widthMillimeters', 'heightMillimeters'] as const) {
        if (!/^[1-9]\d*$/.test(data[field]) || Number(data[field]) > 100_000) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'Enter a package dimension in whole millimeters.',
          });
        }
      }
    }
    if (data.saleFormat === 'auction' && data.variants.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'Auction listings require exactly one variant.',
      });
    }
    const skus = data.variants.map(({ sku }) => sku).filter(Boolean);
    if (new Set(skus).size !== skus.length) {
      context.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'Variant SKUs must be unique.',
      });
    }
  });

export const createMarketplaceListingDraftSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    categoryId: z.string(),
    condition: z.enum(['new', 'like_new', 'excellent', 'good', 'fair', 'for_parts']),
    countryCode: z.string(),
    region: z.string(),
    saleFormat: z.enum(['fixed_price', 'auction']),
    price: z.string(),
    variants: z.array(
      z.object({
        sku: z.string(),
        size: z.string(),
        color: z.string(),
        style: z.string(),
        quantity: z.string(),
        priceOverride: z.string(),
      }),
    ),
    fulfillment: z.enum(['pickup', 'physical']),
    shippingPrice: z.string(),
    weightGrams: z.string(),
    lengthMillimeters: z.string(),
    widthMillimeters: z.string(),
    heightMillimeters: z.string(),
    returnDays: z.enum(['none', '14', '30']),
    /** Legacy single-photo drafts carried one alt text; tolerated so they still hydrate. */
    altText: z.string(),
  })
  .partial()
  .strict();

export type CreateMarketplaceListingData = z.infer<typeof createMarketplaceListingSchema>;

export const createMarketplaceListingDefaults: CreateMarketplaceListingData = {
  title: '',
  description: '',
  categoryId: 'fashion',
  condition: 'good',
  countryCode: 'US',
  region: '',
  saleFormat: 'fixed_price',
  price: '',
  variants: [{ sku: '', size: '', color: '', style: '', quantity: '1', priceOverride: '' }],
  fulfillment: 'physical',
  shippingPrice: '',
  weightGrams: '',
  lengthMillimeters: '',
  widthMillimeters: '',
  heightMillimeters: '',
  returnDays: '30',
};
