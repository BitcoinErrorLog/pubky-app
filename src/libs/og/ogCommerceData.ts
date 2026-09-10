import { Client, Pubky, resolvePubky } from '@synonymdev/pubky';
import {
  type CommerceListingRecord,
  commerceListingRecordSchema,
  type CommerceShopRecord,
  commerceShopRecordSchema,
} from '@/libs/commerce/marketplace-records';
import { commerceEntityIdSchema, commercePubkySchema } from '@/libs/commerce/transaction-contracts';
import { Logger } from '@/libs/logger/logger';
import { getPkarrRelays } from '@/libs/runtime-config/runtime-config';

/**
 * Server-only fetchers for canonical marketplace records, used by
 * `generateMetadata` and the `opengraph-image` routes. Same constraints as
 * `ogData.ts`: no client/Dexie imports — only the pure record schemas and the
 * runtime config.
 *
 * Records are read from each seller's homeserver through the configured PKARR
 * relays, using the same `pubky://` resolution path as client reads. Both path
 * segments are validated against the commerce schemas before any URL is built,
 * so route params can never steer the server-side fetch outside the marketplace
 * namespace.
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

const metadataClient = new Client({
  pkarr: {
    relays: getPkarrRelays(),
    requestTimeout: 10_000,
  },
});

Pubky.withClient(metadataClient);

function buildRecordUrl(ownerPubky: string, recordPath: string): string {
  return resolvePubky(`pubky://${ownerPubky}${MARKETPLACE_RECORD_BASE_PATH}/${recordPath}`);
}

async function fetchRecordJson(url: string, operation: string): Promise<unknown | null> {
  const res = await metadataClient.fetch(url, {
    credentials: 'include',
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status} while fetching marketplace metadata`);
    Logger.warn(`[ogCommerceData] ${operation} failed`, { status: res.status, error });
    throw error;
  }
  return res.json();
}

/**
 * Fetches and validates the canonical listing record for metadata / OG image
 * generation. Returns `null` — the callers' cue to fall back to the generic
 * marketplace card — when the seller/listing params are malformed, the record
 * is missing, or the listing is in the `removed` state (a removed listing must
 * never be advertised in a preview). Fetch and validation failures are thrown
 * so transient failures and contract regressions are not masked as not-found.
 */
export async function fetchListingForMetadata(
  sellerPubky: string,
  listingId: string,
): Promise<CommerceListingRecord | null> {
  const seller = commercePubkySchema.safeParse(sellerPubky);
  const id = commerceEntityIdSchema.safeParse(listingId);
  if (!seller.success || !id.success) return null;

  const json = await fetchRecordJson(buildRecordUrl(seller.data, `listings/${id.data}`), 'fetchListingRecord');
  if (json === null) return null;

  const record = commerceListingRecordSchema.safeParse(json);
  if (!record.success) {
    Logger.warn('[ogCommerceData] Listing record failed validation', {
      issueCount: record.error.issues.length,
    });
    throw new Error('Marketplace listing record failed validation');
  }
  if (record.data.state === 'removed') return null;
  return record.data;
}

/**
 * Fetches and validates the canonical shop record (`shop.json`) for metadata /
 * OG image generation. Returns `null` on malformed params or a missing record.
 * Fetch and validation failures are thrown so callers do not mistake them for
 * not-found.
 */
export async function fetchShopForMetadata(sellerPubky: string): Promise<CommerceShopRecord | null> {
  const seller = commercePubkySchema.safeParse(sellerPubky);
  if (!seller.success) return null;

  const json = await fetchRecordJson(buildRecordUrl(seller.data, 'shop.json'), 'fetchShopRecord');
  if (json === null) return null;

  const record = commerceShopRecordSchema.safeParse(json);
  if (!record.success) {
    Logger.warn('[ogCommerceData] Shop record failed validation', {
      issueCount: record.error.issues.length,
    });
    throw new Error('Marketplace shop record failed validation');
  }
  return record.data;
}
