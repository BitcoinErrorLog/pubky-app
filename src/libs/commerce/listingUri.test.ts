import { describe, expect, it } from 'vitest';
import { isListingUri, parseListingUri } from './listingUri';

const SELLER = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy';
const LISTING_ID = '0034A0X7NJ52A';
const CANONICAL = `pubky://${SELLER}/pub/pubky.app/marketplace/v1/listings/${LISTING_ID}`;

describe('parseListingUri', () => {
  it('parses a canonical listing URI', () => {
    expect(parseListingUri(CANONICAL)).toEqual({ sellerPubky: SELLER, listingId: LISTING_ID });
  });

  it.each([
    ['post URI', `pubky://${SELLER}/pub/pubky.app/posts/${LISTING_ID}`],
    ['shop URI', `pubky://${SELLER}/pub/pubky.app/marketplace/v1/shop.json`],
    ['extra path segment', `${CANONICAL}/extra`],
    ['trailing slash', `${CANONICAL}/`],
    ['query string', `${CANONICAL}?x=1`],
    ['short pubky id', `pubky://short/pub/pubky.app/marketplace/v1/listings/${LISTING_ID}`],
    ['short listing id', `pubky://${SELLER}/pub/pubky.app/marketplace/v1/listings/SHORT`],
    ['http scheme', `https://${SELLER}/pub/pubky.app/marketplace/v1/listings/${LISTING_ID}`],
    ['empty string', ''],
  ])('returns null for %s', (_, uri) => {
    expect(parseListingUri(uri)).toBeNull();
  });
});

describe('isListingUri', () => {
  it('accepts the canonical form and rejects everything else', () => {
    expect(isListingUri(CANONICAL)).toBe(true);
    expect(isListingUri(`pubky://${SELLER}/pub/pubky.app/posts/${LISTING_ID}`)).toBe(false);
  });
});
