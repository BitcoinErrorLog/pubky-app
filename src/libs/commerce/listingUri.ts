/**
 * Parsing for canonical marketplace listing URIs
 * (`pubky://<sellerPubky>/pub/pubky.app/marketplace/v1/listings/<listingId>`),
 * the exact form `listingUriBuilder` produces and pubky-app-specs accepts as
 * a collection item since 0.6.2-marketplace.2.
 */

const LISTING_URI_PATTERN = /^pubky:\/\/([a-z0-9]{52})\/pub\/pubky\.app\/marketplace\/v1\/listings\/([0-9A-Z]{13})$/;

export interface ListingUriRef {
  sellerPubky: string;
  listingId: string;
}

/**
 * Parses a canonical listing URI into its seller pubky and listing id.
 * Returns null for anything that is not an exact canonical listing URI
 * (post URIs, malformed strings, extra path segments, etc.).
 */
export function parseListingUri(uri: string): ListingUriRef | null {
  const match = LISTING_URI_PATTERN.exec(uri);
  if (!match) return null;
  return { sellerPubky: match[1], listingId: match[2] };
}

/** True when the URI is a canonical marketplace listing URI. */
export function isListingUri(uri: string): boolean {
  return LISTING_URI_PATTERN.test(uri);
}
