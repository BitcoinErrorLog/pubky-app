import { describe, expect, it } from 'vitest';
import {
  COMMERCE_FIXTURE_SELLER,
  createCommerceListingFixture,
  createCommerceShopFixture,
  createNexusListingDetailsFixture,
} from '@/test/fixtures/commerce/commerce';
import { CommerceRecordNormalizer } from './commerce.normalizer';

describe('CommerceRecordNormalizer', () => {
  it('normalizes closed shop and listing records', () => {
    const shop = createCommerceShopFixture();
    const listing = createCommerceListingFixture();

    expect(CommerceRecordNormalizer.shop(shop)).toEqual(shop);
    expect(CommerceRecordNormalizer.listing(listing)).toEqual(listing);
  });

  it('returns structured validation issues without copying the rejected payload', () => {
    const listing = {
      ...createCommerceListingFixture(),
      deliveryAddress: 'private-address',
    };

    try {
      CommerceRecordNormalizer.listing(listing);
      expect.unreachable('Expected commerce listing validation to fail');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'AppError',
        code: 'INVALID_INPUT',
        category: 'validation',
        context: {
          issues: expect.any(Array),
        },
      });
      expect(JSON.stringify(error)).not.toContain('private-address');
    }
  });

  it('builds canonical owner-scoped marketplace URIs', () => {
    expect(CommerceRecordNormalizer.shopUri(COMMERCE_FIXTURE_SELLER)).toBe(
      `pubky://${COMMERCE_FIXTURE_SELLER}/pub/pubky.app/marketplace/v1/shop.json`,
    );
    expect(CommerceRecordNormalizer.listingUri(COMMERCE_FIXTURE_SELLER, 'boots_01')).toBe(
      `pubky://${COMMERCE_FIXTURE_SELLER}/pub/pubky.app/marketplace/v1/listings/boots_01`,
    );
    expect(CommerceRecordNormalizer.mediaUri(COMMERCE_FIXTURE_SELLER, 'image_01')).toBe(
      `pubky://${COMMERCE_FIXTURE_SELLER}/pub/pubky.app/marketplace/v1/media/image_01`,
    );
    expect(CommerceRecordNormalizer.reviewUri(COMMERCE_FIXTURE_SELLER, 'review_01')).toBe(
      `pubky://${COMMERCE_FIXTURE_SELLER}/pub/pubky.app/marketplace/v1/reviews/review_01`,
    );
    expect(CommerceRecordNormalizer.collectionUri(COMMERCE_FIXTURE_SELLER, 'summer')).toBe(
      `pubky://${COMMERCE_FIXTURE_SELLER}/pub/pubky.app/marketplace/v1/collections/summer.json`,
    );
  });

  it('normalizes seller-scoped composite listing ids', () => {
    expect(CommerceRecordNormalizer.listingCompositeId(`${COMMERCE_FIXTURE_SELLER}:boots_01`)).toBe(
      `${COMMERCE_FIXTURE_SELLER}:boots_01`,
    );
    expect(() => CommerceRecordNormalizer.listingCompositeId('seller:../private')).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });

  it.each([
    ['invalid owner', 'not-a-pubky', 'listing_01'],
    ['path traversal', COMMERCE_FIXTURE_SELLER, '../private'],
    ['path separator', COMMERCE_FIXTURE_SELLER, 'nested/listing'],
  ])('rejects %s before constructing a URI', (_label, owner, id) => {
    expect(() => CommerceRecordNormalizer.listingUri(owner, id)).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });

  describe('nexusListingStream', () => {
    it('reduces a Nexus listing stream payload to discovery keys', () => {
      const payload = [
        createNexusListingDetailsFixture(),
        createNexusListingDetailsFixture({ owner_id: 'b'.repeat(52), id: 'jacket_01', revision: 3 }),
      ];

      expect(CommerceRecordNormalizer.nexusListingStream(payload)).toEqual([
        { sellerId: COMMERCE_FIXTURE_SELLER, listingId: 'boots_01', revision: 1 },
        { sellerId: 'b'.repeat(52), listingId: 'jacket_01', revision: 3 },
      ]);
    });

    it('accepts a null region and tolerates additive fields Nexus may introduce', () => {
      const payload = [{ ...createNexusListingDetailsFixture({ region: null }), future_field: 'ignored' }];

      expect(CommerceRecordNormalizer.nexusListingStream(payload)).toEqual([
        { sellerId: COMMERCE_FIXTURE_SELLER, listingId: 'boots_01', revision: 1 },
      ]);
    });

    it.each([
      ['a non-array payload', createNexusListingDetailsFixture()],
      ['an owner that is not a pubky', [createNexusListingDetailsFixture({ owner_id: 'not-a-pubky' })]],
      ['a path-unsafe listing id', [createNexusListingDetailsFixture({ id: '../private' })]],
      ['a missing revision', [{ ...createNexusListingDetailsFixture(), revision: undefined }]],
      ['an unknown condition value', [{ ...createNexusListingDetailsFixture(), condition: 'mint' }]],
    ])('rejects %s', (_label, payload) => {
      expect(() => CommerceRecordNormalizer.nexusListingStream(payload)).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT', category: 'validation' }),
      );
    });
  });
});
