import {
  getCdnUrl,
  getMarketplaceNexusUrl,
  getNexusUrl,
  getStreamCacheMaxAgeMs,
} from '@/libs/runtime-config/runtime-config';

// Runtime-configurable: read via getters at call time (PUBKY_RUNTIME_*, staging defaults in
// dev/test). See @/libs/runtime-config. `getMarketplaceNexusUrl` is for commerce/marketplace
// index reads ONLY and falls back to `getNexusUrl` when the override is unset.
export { getCdnUrl, getMarketplaceNexusUrl, getNexusUrl, getStreamCacheMaxAgeMs };

export const NEXUS_LISTINGS_PER_PAGE = 30; // Nexus caps the marketplace listing stream `limit` at 30
export const NEXUS_NOTIFICATIONS_LIMIT = 30;
export const NEXUS_POSTS_PER_PAGE = 10; // Number of posts to fetch per page in streams
export const NEXUS_STREAM_MAX_LIMIT = 50; // Hard cap Nexus enforces on a single stream `limit`; requests above this are rejected
// The user-ids stream (`/v0/stream/users/ids`) enforces a SMALLER cap than the
// general stream limit: `limit` above 20 is rejected with 400 "limit exceeds
// maximum of 20" (verified against the official staging Nexus 2026-08-22 —
// this silently broke inbox counterparty discovery when the messaging sync
// asked for 25).
export const NEXUS_USER_IDS_MAX_LIMIT = 20;
export const NEXUS_USERS_PER_PAGE = 10; // Number of users to fetch per page in streams

/**
 * Timeout for server-side Nexus fetches made while rendering link-preview
 * metadata and dynamic OG images. Social crawlers give up after a few seconds
 * and cache the miss, so a slow Nexus must degrade to the generic fallback
 * quickly instead of hanging the response.
 */
export const NEXUS_SERVER_FETCH_TIMEOUT_MS = 3000;

/**
 * Nexus contract limit: `source=starter_pack` accepts 1-5 comma-separated interest tags
 * (pubky/pubky-nexus#1024). Fixed by the backend — independent of the runtime-configurable
 * `getMaxStreamTags()`, which may be set higher and must never widen this bound.
 */
export const STARTER_PACK_MAX_TAGS = 5;

/** Maximum suggestions shown on the onboarding "Follow your best matches" step (per design) */
export const STARTER_PACK_SUGGESTIONS_LIMIT = 10;

/**
 * Labels rejected by Nexus for `source=starter_pack` (pubky/pubky-nexus#1024).
 * This is intentionally separate from the app's runtime moderation configuration:
 * Nexus reserves these labels regardless of which moderator the frontend follows.
 */
export const STARTER_PACK_RESERVED_TAGS = [
  'hatespeech',
  'harassement',
  'terrorism',
  'violence',
  'illegal_activities',
  'il_adult_nu_sex_act',
] as const;
