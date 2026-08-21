import { describe, expect, it } from 'vitest';
import { commerceListingRecordSchema, commerceShopRecordSchema } from './marketplace-records';
import { createCommerceSandboxCatalog } from './sandbox-catalog';

describe('createCommerceSandboxCatalog', () => {
  it('builds a deterministic, schema-valid catalog with matching projections', () => {
    const first = createCommerceSandboxCatalog();
    const second = createCommerceSandboxCatalog();

    expect(first).toEqual(second);
    expect(first.shops).toHaveLength(10);
    expect(first.listings).toHaveLength(10);
    expect(first.projections).toHaveLength(10);
    expect(first.shops.every((shop) => commerceShopRecordSchema.safeParse(shop).success)).toBe(true);
    expect(first.listings.every((listing) => commerceListingRecordSchema.safeParse(listing).success)).toBe(true);

    const listingRevisions = new Map(
      first.listings.map((listing) => [`${listing.ownerPubky}:${listing.listingId}`, listing.revision]),
    );
    expect(
      first.projections.every((projection) => listingRevisions.get(projection.id) === projection.listing_revision),
    ).toBe(true);
  });

  it('covers fixed-price, auction, fashion, electronics, home, and collectibles discovery', () => {
    const { listings } = createCommerceSandboxCatalog();

    expect(new Set(listings.map(({ sale }) => sale.format))).toEqual(new Set(['fixed_price', 'auction']));
    expect(new Set(listings.map(({ categoryId }) => categoryId.split('-')[0]))).toEqual(
      new Set(['fashion', 'electronics', 'home', 'collectibles']),
    );
  });

  it('mixes taxonomy v1 records (no attributes) with v2 records carrying item specifics', () => {
    const { listings } = createCommerceSandboxCatalog();
    const v1 = listings.filter(({ taxonomyVersion }) => taxonomyVersion === 1);
    const v2 = listings.filter(({ taxonomyVersion }) => taxonomyVersion === 2);

    expect(v1.length).toBeGreaterThan(0);
    expect(v2.length).toBeGreaterThan(0);
    expect(v1.every(({ attributes }) => attributes === undefined)).toBe(true);
    expect(v2.every(({ attributes }) => attributes !== undefined && Object.keys(attributes).length > 0)).toBe(true);

    const fleece = listings.find(({ listingId }) => listingId === 'varsity_fleece');
    expect(fleece?.attributes).toMatchObject({ size: 'L', brand: 'Champion', color: ['grey', 'navy'] });
  });
});
