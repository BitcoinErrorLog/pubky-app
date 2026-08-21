import {
  type CommerceListingRecord,
  commerceListingRecordSchema,
  type CommerceShopRecord,
  commerceShopRecordSchema,
} from '@/libs/commerce/marketplace-records';
import { commerceEntityIdSchema, commercePubkySchema } from '@/libs/commerce/transaction-contracts';
import { Logger } from '@/libs/logger/logger';
import { getHomeserverUrl } from '@/libs/runtime-config/runtime-config';

/**
 * Server-only fetchers for canonical marketplace records, used by
 * `generateMetadata` and the `opengraph-image` routes. Same constraints as
 * `ogData.ts`: no client/Dexie imports — only the pure record schemas and the
 * runtime config.
 *
 * Records are read from the deployment's configured homeserver over its public
 * unauthenticated `/pub/` endpoint (`?pubky-host=<seller>` selects the tenant —
 * same shape as `resolveMarketplaceMediaUrl`). Both path segments are validated
 * against the commerce schemas before any URL is built, so route params can
 * never steer the server-side fetch anywhere but the configured homeserver's
 * marketplace namespace.
 */

/**
 * Revalidation window (seconds) for marketplace record/media fetches feeding
 * metadata and OG images. Shorter than the social OG_REVALIDATE hour because
 * listings change state (paused/ended/price) and stale previews would misstate
 * purchasability; still long enough that crawler bursts (each platform fetches
 * the page + image separately) hit the Data Cache instead of the homeserver.
 */
export const OG_COMMERCE_REVALIDATE = 300;

/**
 * Cache-Control for the rendered marketplace OG PNGs, matching the record
 * revalidate window (the social default in `OG_CACHE_HEADERS` is an hour).
 */
export const OG_COMMERCE_CACHE_HEADERS = {
  'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400',
} as const;

const MARKETPLACE_RECORD_BASE_PATH = '/pub/pubky.app/marketplace/v1';

function buildRecordUrl(ownerPubky: string, recordPath: string): string {
  const base = getHomeserverUrl().replace(/\/$/, '');
  return `${base}${MARKETPLACE_RECORD_BASE_PATH}/${recordPath}?pubky-host=${ownerPubky}`;
}

async function fetchRecordJson(url: string, operation: string): Promise<unknown | null> {
  const res = await fetch(url, { next: { revalidate: OG_COMMERCE_REVALIDATE } });
  if (res.status === 404) return null;
  if (!res.ok) {
    Logger.warn(`[ogCommerceData] ${operation} failed`, { url, status: res.status });
    return null;
  }
  return res.json();
}

/**
 * Fetches and validates the canonical listing record for metadata / OG image
 * generation. Returns `null` — the callers' cue to fall back to the generic
 * marketplace card — when the seller/listing params are malformed, the record
 * is missing or fails validation, or the listing is in the `removed` state
 * (a removed listing must never be advertised in a preview).
 */
export async function fetchListingForMetadata(
  sellerPubky: string,
  listingId: string,
): Promise<CommerceListingRecord | null> {
  const seller = commercePubkySchema.safeParse(sellerPubky);
  const id = commerceEntityIdSchema.safeParse(listingId);
  if (!seller.success || !id.success) return null;

  try {
    const json = await fetchRecordJson(buildRecordUrl(seller.data, `listings/${id.data}`), 'fetchListingRecord');
    if (json === null) return null;

    const record = commerceListingRecordSchema.safeParse(json);
    if (!record.success) {
      Logger.warn('[ogCommerceData] Listing record failed validation', { sellerPubky, listingId });
      return null;
    }
    if (record.data.state === 'removed') return null;
    return record.data;
  } catch (error) {
    Logger.warn('[ogCommerceData] Failed to fetch listing record', { sellerPubky, listingId, error });
    return null;
  }
}

/**
 * Fetches and validates the canonical shop record (`shop.json`) for metadata /
 * OG image generation. Returns `null` on malformed params, a missing record,
 * or validation failure so callers fall back to the generic marketplace card.
 */
export async function fetchShopForMetadata(sellerPubky: string): Promise<CommerceShopRecord | null> {
  const seller = commercePubkySchema.safeParse(sellerPubky);
  if (!seller.success) return null;

  try {
    const json = await fetchRecordJson(buildRecordUrl(seller.data, 'shop.json'), 'fetchShopRecord');
    if (json === null) return null;

    const record = commerceShopRecordSchema.safeParse(json);
    if (!record.success) {
      Logger.warn('[ogCommerceData] Shop record failed validation', { sellerPubky });
      return null;
    }
    return record.data;
  } catch (error) {
    Logger.warn('[ogCommerceData] Failed to fetch shop record', { sellerPubky, error });
    return null;
  }
}
