import { z } from 'zod';
import {
  COMMERCE_LISTING_DESCRIPTION_MAX_CHARS,
  COMMERCE_LISTING_TITLE_MAX_CHARS,
  COMMERCE_LISTING_TITLE_MIN_CHARS,
} from '@/config/commerce';
import {
  amountInputSchemaForAsset,
  assetForListingCurrency,
  type ListingCurrencyChoice,
} from '@/libs/commerce/pricing';
import { gramsFromWeightInput, type MeasurementSystem, millimetersFromDimensionInput } from '@/libs/commerce/units';

export const CREATE_MARKETPLACE_LISTING_FIELDS = {
  TITLE: 'title',
  DESCRIPTION: 'description',
  CATEGORY: 'categoryId',
  CONDITION: 'condition',
  COUNTRY_CODE: 'countryCode',
  REGION: 'region',
  SALE_FORMAT: 'saleFormat',
  CURRENCY: 'currency',
  PRICE: 'price',
  VARIANTS: 'variants',
  FULFILLMENT: 'fulfillment',
  SHIPPING_LABEL: 'shippingLabel',
  SHIPPING_PRICE: 'shippingPrice',
  SHIPPING_MIN_DAYS: 'shippingMinDays',
  SHIPPING_MAX_DAYS: 'shippingMaxDays',
  MEASUREMENT_SYSTEM: 'measurementSystem',
  PACKAGE_WEIGHT: 'packageWeight',
  PACKAGE_LENGTH: 'packageLength',
  PACKAGE_WIDTH: 'packageWidth',
  PACKAGE_HEIGHT: 'packageHeight',
  RETURN_DAYS: 'returnDays',
} as const;

/** Canonical record bounds — the form validates converted values against these. */
const PACKAGE_WEIGHT_MAX_GRAMS = 1_000_000;
const PACKAGE_DIMENSION_MAX_MM = 100_000;

const listingVariantSchema = z.object({
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
});

function validateMoneyField(
  value: string,
  currency: ListingCurrencyChoice,
  path: Array<string | number>,
  context: z.RefinementCtx,
): void {
  const parsed = amountInputSchemaForAsset(assetForListingCurrency(currency)).safeParse(value);
  if (!parsed.success) {
    context.addIssue({
      code: 'custom',
      path,
      message: parsed.error.issues[0]?.message ?? 'Enter a valid amount.',
    });
  }
}

function validatePackageWeight(value: string, system: MeasurementSystem, context: z.RefinementCtx): void {
  const pattern = system === 'imperial' ? /^\d+(?:\.\d)?$/ : /^\d+$/;
  const grams = pattern.test(value) ? gramsFromWeightInput(Number(value), system) : Number.NaN;
  if (!(grams >= 1 && grams <= PACKAGE_WEIGHT_MAX_GRAMS)) {
    context.addIssue({
      code: 'custom',
      path: [CREATE_MARKETPLACE_LISTING_FIELDS.PACKAGE_WEIGHT],
      message:
        system === 'imperial'
          ? 'Enter a package weight in ounces (one decimal allowed).'
          : 'Enter a package weight in whole grams.',
    });
  }
}

function validatePackageDimension(
  value: string,
  field: string,
  system: MeasurementSystem,
  context: z.RefinementCtx,
): void {
  const millimeters = /^\d+(?:\.\d)?$/.test(value) ? millimetersFromDimensionInput(Number(value), system) : Number.NaN;
  if (!(millimeters >= 1 && millimeters <= PACKAGE_DIMENSION_MAX_MM)) {
    context.addIssue({
      code: 'custom',
      path: [field],
      message:
        system === 'imperial'
          ? 'Enter a package dimension in inches (one decimal allowed).'
          : 'Enter a package dimension in centimeters (one decimal allowed).',
    });
  }
}

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
    currency: z.enum(['USD', 'SATS']),
    price: z.string().trim(),
    variants: z.array(listingVariantSchema).min(1, 'Add at least one variant.').max(100, 'Too many variants.'),
    fulfillment: z.enum(['pickup', 'physical']),
    shippingLabel: z.string().trim().max(100, 'Keep the shipping label under 100 characters.'),
    shippingPrice: z.string().trim(),
    shippingMinDays: z.string().trim(),
    shippingMaxDays: z.string().trim(),
    measurementSystem: z.enum(['metric', 'imperial']),
    packageWeight: z.string().trim(),
    packageLength: z.string().trim(),
    packageWidth: z.string().trim(),
    packageHeight: z.string().trim(),
    returnDays: z.enum(['none', '14', '30']),
  })
  .superRefine((data, context) => {
    validateMoneyField(data.price, data.currency, [CREATE_MARKETPLACE_LISTING_FIELDS.PRICE], context);
    data.variants.forEach((variant, index) => {
      if (variant.priceOverride) {
        validateMoneyField(variant.priceOverride, data.currency, ['variants', index, 'priceOverride'], context);
      }
    });
    if (data.fulfillment === 'physical') {
      validateMoneyField(
        data.shippingPrice,
        data.currency,
        [CREATE_MARKETPLACE_LISTING_FIELDS.SHIPPING_PRICE],
        context,
      );
      if (!data.shippingLabel) {
        context.addIssue({
          code: 'custom',
          path: ['shippingLabel'],
          message: 'Give the shipping option a label buyers will see.',
        });
      }
      const minDaysValid = /^\d+$/.test(data.shippingMinDays) && Number(data.shippingMinDays) <= 365;
      const maxDaysValid = /^\d+$/.test(data.shippingMaxDays) && Number(data.shippingMaxDays) <= 365;
      if (!minDaysValid) {
        context.addIssue({
          code: 'custom',
          path: ['shippingMinDays'],
          message: 'Enter an estimate in whole days (0\u2013365).',
        });
      }
      if (!maxDaysValid) {
        context.addIssue({
          code: 'custom',
          path: ['shippingMaxDays'],
          message: 'Enter an estimate in whole days (0\u2013365).',
        });
      }
      if (minDaysValid && maxDaysValid && Number(data.shippingMaxDays) < Number(data.shippingMinDays)) {
        context.addIssue({
          code: 'custom',
          path: ['shippingMaxDays'],
          message: 'The maximum estimate cannot precede the minimum.',
        });
      }
      validatePackageWeight(data.packageWeight, data.measurementSystem, context);
      for (const field of [
        CREATE_MARKETPLACE_LISTING_FIELDS.PACKAGE_LENGTH,
        CREATE_MARKETPLACE_LISTING_FIELDS.PACKAGE_WIDTH,
        CREATE_MARKETPLACE_LISTING_FIELDS.PACKAGE_HEIGHT,
      ] as const) {
        validatePackageDimension(data[field], field, data.measurementSystem, context);
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
    currency: z.enum(['USD', 'SATS']),
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
    shippingLabel: z.string(),
    shippingPrice: z.string(),
    shippingMinDays: z.string(),
    shippingMaxDays: z.string(),
    measurementSystem: z.enum(['metric', 'imperial']),
    packageWeight: z.string(),
    packageLength: z.string(),
    packageWidth: z.string(),
    packageHeight: z.string(),
    returnDays: z.enum(['none', '14', '30']),
    /** Legacy single-photo drafts carried one alt text; tolerated so they still hydrate. */
    altText: z.string(),
    /** Legacy drafts stored package fields as raw millimeters/grams; tolerated and converted on restore. */
    weightGrams: z.string(),
    lengthMillimeters: z.string(),
    widthMillimeters: z.string(),
    heightMillimeters: z.string(),
  })
  .partial()
  .strict();

export type CreateMarketplaceListingData = z.infer<typeof createMarketplaceListingSchema>;
export type CreateMarketplaceListingDraftData = z.infer<typeof createMarketplaceListingDraftSchema>;

export const createMarketplaceListingDefaults: CreateMarketplaceListingData = {
  title: '',
  description: '',
  categoryId: 'fashion',
  condition: 'good',
  countryCode: 'US',
  region: '',
  saleFormat: 'fixed_price',
  currency: 'USD',
  price: '',
  variants: [{ sku: '', size: '', color: '', style: '', quantity: '1', priceOverride: '' }],
  fulfillment: 'physical',
  shippingLabel: 'Seller shipping',
  shippingPrice: '',
  shippingMinDays: '3',
  shippingMaxDays: '7',
  measurementSystem: 'metric',
  packageWeight: '',
  packageLength: '',
  packageWidth: '',
  packageHeight: '',
  returnDays: '30',
};
