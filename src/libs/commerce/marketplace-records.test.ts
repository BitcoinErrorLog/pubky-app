import { describe, expect, it } from 'vitest';
import { COMMERCE_CONTRACT_VERSION, COMMERCE_TAXONOMY_VERSION } from '@/config/commerce';
import {
  commerceCollectionRecordSchema,
  type CommerceListingRecord,
  commerceListingRecordSchema,
  commercePublicRecordSchema,
  commerceReviewRecordSchema,
  commerceShopRecordSchema,
  commerceTombstoneRecordSchema,
  locksPublicUriSchema,
  marketplacePublicUriSchema,
} from './marketplace-records';

const SELLER_PUBKY = 'y'.repeat(52);
const BUYER_PUBKY = 'b'.repeat(52);
const CREATED_AT = '2026-08-19T20:00:00.000Z';
const UPDATED_AT = '2026-08-19T21:00:00.000Z';
const IMAGE_URL = `pubky://${SELLER_PUBKY}/pub/pubky.app/marketplace/v1/media/image_01`;
const LOCK_URL = `pubky://${SELLER_PUBKY}/pub/locks.app/boots_01.json`;

function usd(amountMinor: number) {
  return { amountMinor, currency: 'USD', exponent: 2 };
}

function makeFixedListing(): CommerceListingRecord {
  return {
    schemaVersion: COMMERCE_CONTRACT_VERSION,
    recordType: 'listing',
    ownerPubky: SELLER_PUBKY,
    revision: 1,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    listingId: 'boots_01',
    state: 'active',
    title: 'Vintage leather boots',
    description: 'Well cared for boots with light wear.',
    taxonomyVersion: COMMERCE_TAXONOMY_VERSION,
    categoryId: 'fashion-shoes-boots',
    condition: 'good',
    conditionDetails: 'Light sole wear shown in the photos.',
    tags: ['vintage', 'leather'],
    location: {
      countryCode: 'US',
      region: 'NY',
    },
    media: [
      {
        id: 'image_01',
        type: 'image',
        url: IMAGE_URL,
        contentHash: 'a'.repeat(64),
        mimeType: 'image/jpeg',
        byteSize: 10_000,
        width: 1_200,
        height: 1_600,
        altText: 'Brown leather boots viewed from the side',
      },
    ],
    variants: [
      {
        id: 'variant_01',
        sku: 'BOOTS-42',
        options: {
          size: '42',
          color: 'Brown',
        },
        quantity: 1,
        mediaIds: ['image_01'],
        enabled: true,
      },
    ],
    sale: {
      format: 'fixed_price',
      unitPrice: usd(12_500),
      acceptsOffers: true,
    },
    fulfillmentMethods: ['physical'],
    package: {
      weightGrams: 1_200,
      lengthMillimeters: 350,
      widthMillimeters: 250,
      heightMillimeters: 150,
    },
    shippingOptions: [
      {
        id: 'ground',
        pricing: 'flat',
        label: 'Ground shipping',
        price: usd(1_200),
        estimatedMinDays: 3,
        estimatedMaxDays: 7,
      },
    ],
    returnPolicy: {
      acceptsReturns: true,
      returnWindowDays: 30,
      buyerPaysReturnShipping: true,
      details: 'Return in the original condition.',
    },
    adultOnly: false,
  };
}

function makeAuctionListing(): CommerceListingRecord {
  const listing = makeFixedListing();
  listing.sale = {
    format: 'auction',
    startingPrice: usd(5_000),
    reservePrice: usd(8_000),
    buyNowPrice: usd(20_000),
    minimumIncrement: usd(500),
    startsAt: '2026-08-20T20:00:00.000Z',
    endsAt: '2026-08-27T20:00:00.000Z',
    antiSnipingWindowSeconds: 120,
    antiSnipingExtensionSeconds: 120,
  };
  return listing;
}

describe('commerceListingRecordSchema', () => {
  it('accepts a complete fixed-price physical listing', () => {
    expect(commerceListingRecordSchema.parse(makeFixedListing())).toEqual(makeFixedListing());
  });

  it('rejects unknown fields so private data cannot hitchhike on public records', () => {
    const listing = {
      ...makeFixedListing(),
      deliveryAddress: 'private',
    };

    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(false);
  });

  it('rejects an updated timestamp before creation', () => {
    const listing = makeFixedListing();
    listing.updatedAt = '2026-08-18T20:00:00.000Z';

    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(false);
  });

  it('requires unique media, variant, SKU, tag, fulfillment, and shipping ids', () => {
    const listing = makeFixedListing();
    listing.media.push({ ...listing.media[0] });
    listing.variants.push({ ...listing.variants[0], id: 'variant_02' });
    listing.tags.push('vintage');
    listing.fulfillmentMethods.push('physical');
    listing.shippingOptions.push({ ...listing.shippingOptions[0] });

    const result = commerceListingRecordSchema.safeParse(listing);

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(({ message }) => message);
      expect(messages).toEqual(
        expect.arrayContaining([
          'Media ids must be unique',
          'Variant SKUs must be unique',
          'Tags must be unique',
          'Fulfillment methods must be unique',
          'Shipping option ids must be unique',
        ]),
      );
    }
  });

  it('limits variant option dimensions to three', () => {
    const listing = makeFixedListing();
    listing.variants[0].options = {
      size: '42',
      color: 'Brown',
      width: 'Regular',
      material: 'Leather',
    };

    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(false);
  });

  it('rejects variants that reference unknown media', () => {
    const listing = makeFixedListing();
    listing.variants[0].mediaIds = ['missing'];

    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(false);
  });

  it('requires intended quantity for an active listing', () => {
    const listing = makeFixedListing();
    listing.variants[0].quantity = 0;

    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(false);
  });

  it('requires physical package facts and shipping options', () => {
    const listing = makeFixedListing();
    listing.package = undefined;
    listing.shippingOptions = [];

    const result = commerceListingRecordSchema.safeParse(listing);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(({ message }) => message)).toEqual(
        expect.arrayContaining([
          'Physical fulfillment requires package facts',
          'Physical fulfillment requires a shipping option',
        ]),
      );
    }
  });

  it('requires digital fulfillment and a Locks policy together', () => {
    const missingLock = makeFixedListing();
    missingLock.fulfillmentMethods = ['digital'];
    missingLock.package = undefined;
    missingLock.shippingOptions = [];

    const unexpectedLock = makeFixedListing();
    unexpectedLock.digitalLock = {
      policyUri: LOCK_URL,
      resourceHash: 'b'.repeat(64),
      minimumConfirmations: 1,
    };

    expect(commerceListingRecordSchema.safeParse(missingLock).success).toBe(false);
    expect(commerceListingRecordSchema.safeParse(unexpectedLock).success).toBe(false);
  });

  it('accepts digital fulfillment with a current Locks confirmation policy', () => {
    const listing = makeFixedListing();
    listing.fulfillmentMethods = ['digital'];
    listing.package = undefined;
    listing.shippingOptions = [];
    listing.digitalLock = {
      policyUri: LOCK_URL,
      resourceHash: 'b'.repeat(64),
      minimumConfirmations: 6,
    };

    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(true);
  });

  it('rejects a Locks policy above Paykit Server finality', () => {
    const listing = makeFixedListing();
    listing.fulfillmentMethods = ['digital'];
    listing.package = undefined;
    listing.shippingOptions = [];
    listing.digitalLock = {
      policyUri: LOCK_URL,
      resourceHash: 'b'.repeat(64),
      minimumConfirmations: 7,
    };

    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(false);
  });

  it('requires media to be owned by the listing seller', () => {
    const listing = makeFixedListing();
    listing.media[0].url = `pubky://${BUYER_PUBKY}/pub/pubky.app/marketplace/v1/media/image_01`;

    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(false);
  });

  it('requires variant and shipping prices to use the listing asset', () => {
    const listing = makeFixedListing();
    listing.variants[0].priceOverride = { amountMinor: 100, currency: 'BTC', exponent: 8 };
    const shippingOption = listing.shippingOptions[0];
    if (shippingOption.pricing === 'flat') {
      shippingOption.price = { amountMinor: 1_000, currency: 'EUR', exponent: 2 };
    }

    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(false);
  });

  it('allows at most one video and requires video duration', () => {
    const listing = makeFixedListing();
    const video = {
      ...listing.media[0],
      id: 'video_01',
      type: 'video' as const,
      url: `pubky://${SELLER_PUBKY}/pub/pubky.app/marketplace/v1/media/video_01`,
      mimeType: 'video/mp4',
      durationMs: 10_000,
    };
    listing.media.push(video, { ...video, id: 'video_02', url: `${video.url}_2` });

    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(false);

    listing.media = [listing.media[0], { ...video, durationMs: undefined }];
    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(false);
  });
});

describe('auction listing rules', () => {
  it('accepts one-variant auction terms in one asset', () => {
    expect(commerceListingRecordSchema.safeParse(makeAuctionListing()).success).toBe(true);
  });

  it('rejects reversed dates, low reserve, low buy-now, and mixed assets', () => {
    const listing = makeAuctionListing();
    if (listing.sale.format !== 'auction') throw new TypeError('Expected auction fixture');
    listing.sale.endsAt = listing.sale.startsAt;
    listing.sale.reservePrice = usd(4_999);
    listing.sale.buyNowPrice = usd(5_000);
    listing.sale.minimumIncrement = { amountMinor: 1, currency: 'BTC', exponent: 8 };

    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(false);
  });

  it('rejects multiple auction variants', () => {
    const listing = makeAuctionListing();
    listing.variants.push({
      ...listing.variants[0],
      id: 'variant_02',
      sku: 'BOOTS-43',
    });

    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(false);
  });
});

describe('other public marketplace records', () => {
  it('accepts a public shop without precise location data', () => {
    expect(
      commerceShopRecordSchema.safeParse({
        schemaVersion: COMMERCE_CONTRACT_VERSION,
        recordType: 'shop',
        ownerPubky: SELLER_PUBKY,
        revision: 1,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        name: 'Satoshi Vintage',
        bio: 'Circular fashion and Bitcoin.',
        location: { countryCode: 'US', region: 'NY' },
        shippingPolicy: 'Ships within three business days.',
        returnPolicy: 'Returns accepted within 30 days.',
        vacationMode: false,
      }).success,
    ).toBe(true);
  });

  it('accepts a transaction-attested public review', () => {
    expect(
      commerceReviewRecordSchema.safeParse({
        schemaVersion: COMMERCE_CONTRACT_VERSION,
        recordType: 'review',
        ownerPubky: BUYER_PUBKY,
        revision: 1,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        reviewId: 'review_01',
        subjectPubky: SELLER_PUBKY,
        listingOwnerPubky: SELLER_PUBKY,
        listingId: 'boots_01',
        role: 'buyer_reviewing_seller',
        ratings: {
          overall: 5,
          itemAccuracy: 5,
          shipping: 4,
          communication: 5,
        },
        text: 'Accurate description and careful packaging.',
        eligibilityAttestation: 'signed.review.attestation_value_123456789',
      }).success,
    ).toBe(true);
  });

  it('rejects duplicate entries in a public collection', () => {
    const result = commerceCollectionRecordSchema.safeParse({
      schemaVersion: COMMERCE_CONTRACT_VERSION,
      recordType: 'collection',
      ownerPubky: SELLER_PUBKY,
      revision: 1,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      collectionId: 'summer',
      name: 'Summer',
      description: 'Warm weather favorites',
      listingIds: ['boots_01', 'boots_01'],
    });

    expect(result.success).toBe(false);
  });

  it('accepts a minimal versioned tombstone through the public record union', () => {
    const tombstone = {
      schemaVersion: COMMERCE_CONTRACT_VERSION,
      recordType: 'tombstone' as const,
      ownerPubky: SELLER_PUBKY,
      revision: 2,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      targetType: 'listing' as const,
      targetId: 'boots_01',
      reason: 'deleted' as const,
    };

    expect(commerceTombstoneRecordSchema.safeParse(tombstone).success).toBe(true);
    expect(commercePublicRecordSchema.safeParse(tombstone).success).toBe(true);
  });
});

describe('marketplace URI contracts', () => {
  it('accepts only marketplace and Locks Pubky paths', () => {
    expect(marketplacePublicUriSchema.safeParse(IMAGE_URL).success).toBe(true);
    expect(locksPublicUriSchema.safeParse(LOCK_URL).success).toBe(true);
    expect(marketplacePublicUriSchema.safeParse('https://example.com/image.jpg').success).toBe(false);
    expect(locksPublicUriSchema.safeParse(`${IMAGE_URL}.json`).success).toBe(false);
  });
});
