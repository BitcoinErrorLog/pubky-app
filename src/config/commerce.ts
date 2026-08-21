import {
  getCommerceAdapterMode,
  getCommercePollIntervalMs,
  getLocksUrl,
  getMarketplaceUrl,
  getPaykitSetupUrl,
} from '@/libs/runtime-config/runtime-config';
import type { CommerceAdapterMode } from '@/libs/runtime-config/runtime-config.schema';

export {
  type CommerceAdapterMode,
  getCommerceAdapterMode,
  getCommercePollIntervalMs,
  getLocksUrl,
  getMarketplaceUrl,
  getPaykitSetupUrl,
};

/**
 * True when the mode has a marketplace transaction backend the interactive
 * flows can operate against: the in-memory sandbox (simulated outcomes) or
 * the durable Rust transaction service (authoritative outcomes, selected by
 * both durable modes — see {@link isDurableCommerceMode}). `unavailable` has
 * no command/read surface and the shopping UI must say so.
 */
export function isTransactionalCommerceMode(mode: CommerceAdapterMode): boolean {
  return mode === 'sandbox' || isDurableCommerceMode(mode);
}

/**
 * True when marketplace commands and reads go to the durable Rust Marketplace
 * Transaction Service (Pubky AuthToken sessions, snake_case wire, role-scoped
 * projections). The two durable modes COMPOSE rather than exclude:
 *
 * - `transaction-service`: the durable authority alone; payments stay on its
 *   sandbox adapter and this client refuses to simulate them, so orders
 *   honestly sit awaiting payment.
 * - `locks-paykit`: the same durable authority PLUS the real Locks/Paykit
 *   payment rails. The client submits the buyer's proof bundle to the Lock
 *   Server and registers the correlation via `payment.register_locks`; the
 *   service's worker — never this client — verifies the Locks lifecycle and
 *   confirms the payment.
 */
export function isDurableCommerceMode(mode: CommerceAdapterMode): boolean {
  return mode === 'transaction-service' || mode === 'locks-paykit';
}

/** True when the real Locks/Paykit buyer payment rails are active. */
export function isLocksPaykitCommerceMode(mode: CommerceAdapterMode): boolean {
  return mode === 'locks-paykit';
}

export const COMMERCE_CONTRACT_VERSION = 1 as const;
export const COMMERCE_TAXONOMY_VERSION = 1 as const;

export const COMMERCE_SHOP_NAME_MAX_CHARS = 60;
export const COMMERCE_SHOP_BIO_MAX_CHARS = 1_000;
export const COMMERCE_SHOP_POLICY_MAX_CHARS = 4_000;

export const COMMERCE_LISTING_TITLE_MIN_CHARS = 3;
export const COMMERCE_LISTING_TITLE_MAX_CHARS = 80;
export const COMMERCE_LISTING_DESCRIPTION_MAX_CHARS = 10_000;
export const COMMERCE_LISTING_MAX_IMAGES = 12;
/**
 * How many photos the in-app sell/edit studio accepts per listing. The record
 * contract (and the pubky-app-specs fork) allows up to
 * {@link COMMERCE_LISTING_MAX_IMAGES}; the studio deliberately caps composing
 * at 8 so records published elsewhere with more images still validate and
 * render.
 */
export const COMMERCE_LISTING_STUDIO_MAX_PHOTOS = 8;
export const COMMERCE_LISTING_MAX_VIDEOS = 1;
export const COMMERCE_LISTING_MAX_MEDIA = COMMERCE_LISTING_MAX_IMAGES + COMMERCE_LISTING_MAX_VIDEOS;
export const COMMERCE_LISTING_MAX_VARIANTS = 100;
export const COMMERCE_LISTING_MAX_OPTION_DIMENSIONS = 3;
export const COMMERCE_LISTING_MAX_TAGS = 10;
export const COMMERCE_LISTING_MAX_QUANTITY = 1_000_000;

export const COMMERCE_REVIEW_TEXT_MAX_CHARS = 5_000;
/**
 * How long a reviewer may edit their review after creating it, mirroring the
 * durable service's `REVIEW_EDIT_WINDOW_SECONDS`. `review.update` exists
 * only on the durable service (the sandbox has no review editing), and the
 * service enforces the window against the review's `created_at` — the client
 * uses this constant purely to withhold the edit affordance once the window
 * has closed instead of failing on submit.
 */
export const COMMERCE_REVIEW_EDIT_WINDOW_SECONDS = 24 * 60 * 60;
export const COMMERCE_MEDIA_ALT_TEXT_MAX_CHARS = 300;
export const COMMERCE_CATALOG_SKELETON_COUNT = 8;

export const COMMERCE_CATEGORIES = [
  { id: 'fashion', label: 'Fashion' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'home', label: 'Home' },
  { id: 'collectibles', label: 'Collectibles' },
] as const;
