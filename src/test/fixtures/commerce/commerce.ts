import { COMMERCE_CONTRACT_VERSION, COMMERCE_TAXONOMY_VERSION } from '@/config/commerce';
import type { CommerceListingRecord, CommerceShopRecord } from '@/libs/commerce/marketplace-records';
import type {
  CommerceListingProjectionModelSchema,
  CommerceSyncJobModelSchema,
} from '@/models/commerce/commerce.schema';

export const COMMERCE_FIXTURE_SELLER = 'y'.repeat(52);
export const COMMERCE_FIXTURE_BUYER = 'b'.repeat(52);
export const COMMERCE_FIXTURE_CREATED_AT = '2026-08-19T20:00:00.000Z';
export const COMMERCE_FIXTURE_UPDATED_AT = '2026-08-19T21:00:00.000Z';

export function createCommerceShopFixture(overrides: Partial<CommerceShopRecord> = {}): CommerceShopRecord {
  return {
    schemaVersion: COMMERCE_CONTRACT_VERSION,
    recordType: 'shop',
    ownerPubky: COMMERCE_FIXTURE_SELLER,
    revision: 1,
    createdAt: COMMERCE_FIXTURE_CREATED_AT,
    updatedAt: COMMERCE_FIXTURE_UPDATED_AT,
    name: 'Satoshi Vintage',
    bio: 'Circular fashion and Bitcoin.',
    location: { countryCode: 'US', region: 'NY' },
    shippingPolicy: 'Ships within three business days.',
    returnPolicy: 'Returns accepted within 30 days.',
    vacationMode: false,
    ...overrides,
  };
}

export function createCommerceListingFixture(overrides: Partial<CommerceListingRecord> = {}): CommerceListingRecord {
  return {
    schemaVersion: COMMERCE_CONTRACT_VERSION,
    recordType: 'listing',
    ownerPubky: COMMERCE_FIXTURE_SELLER,
    revision: 1,
    createdAt: COMMERCE_FIXTURE_CREATED_AT,
    updatedAt: COMMERCE_FIXTURE_UPDATED_AT,
    listingId: 'boots_01',
    state: 'active',
    title: 'Vintage leather boots',
    description: 'Well cared for boots with light wear.',
    taxonomyVersion: COMMERCE_TAXONOMY_VERSION,
    categoryId: 'fashion-shoes-boots',
    condition: 'good',
    tags: ['vintage'],
    location: { countryCode: 'US', region: 'NY' },
    media: [
      {
        id: 'image_01',
        type: 'image',
        url: `pubky://${COMMERCE_FIXTURE_SELLER}/pub/pubky.app/marketplace/v1/media/image_01`,
        contentHash: 'a'.repeat(64),
        mimeType: 'image/jpeg',
        byteSize: 10_000,
        width: 1_200,
        height: 1_600,
        altText: 'Brown leather boots',
      },
    ],
    variants: [
      {
        id: 'variant_01',
        options: { size: '42' },
        quantity: 1,
        mediaIds: ['image_01'],
        enabled: true,
      },
    ],
    sale: {
      format: 'fixed_price',
      unitPrice: { amountMinor: 12_500, currency: 'USD', exponent: 2 },
      acceptsOffers: true,
    },
    fulfillmentMethods: ['pickup'],
    shippingOptions: [],
    returnPolicy: {
      acceptsReturns: true,
      returnWindowDays: 30,
      buyerPaysReturnShipping: true,
    },
    adultOnly: false,
    ...overrides,
  };
}

export function createCommerceProjectionFixture(
  overrides: Partial<CommerceListingProjectionModelSchema> = {},
): CommerceListingProjectionModelSchema {
  return {
    id: `${COMMERCE_FIXTURE_SELLER}:boots_01`,
    seller_id: COMMERCE_FIXTURE_SELLER,
    listing_id: 'boots_01',
    listing_revision: 1,
    content_hash: 'c'.repeat(64),
    server_revision: 3,
    state: 'available',
    available_quantity: 1,
    current_price: { amountMinor: 12_500, currency: 'USD', exponent: 2 },
    auction_state: null,
    bid_count: 0,
    sync_status: 'synced',
    synced_at: 3_000,
    ...overrides,
  };
}

export function createCommerceSyncJobFixture(
  overrides: Partial<CommerceSyncJobModelSchema> = {},
): CommerceSyncJobModelSchema {
  return {
    id: '018f47d2-6a27-7c23-a49d-6b21bb770120',
    owner_id: COMMERCE_FIXTURE_SELLER,
    entity_type: 'listing',
    entity_id: 'boots_01',
    operation: 'register',
    status: 'pending',
    attempts: 0,
    next_attempt_at: 1_000,
    last_error_code: null,
    payload: { listingId: 'boots_01' },
    created_at: 500,
    updated_at: 500,
    ...overrides,
  };
}
