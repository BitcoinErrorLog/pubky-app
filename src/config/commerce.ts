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
 * the durable Rust transaction service (authoritative outcomes). The other
 * modes have no command/read surface and the shopping UI must say so.
 */
export function isTransactionalCommerceMode(mode: CommerceAdapterMode): boolean {
  return mode === 'sandbox' || mode === 'transaction-service';
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
export const COMMERCE_LISTING_MAX_VIDEOS = 1;
export const COMMERCE_LISTING_MAX_MEDIA = COMMERCE_LISTING_MAX_IMAGES + COMMERCE_LISTING_MAX_VIDEOS;
export const COMMERCE_LISTING_MAX_VARIANTS = 100;
export const COMMERCE_LISTING_MAX_OPTION_DIMENSIONS = 3;
export const COMMERCE_LISTING_MAX_TAGS = 10;
export const COMMERCE_LISTING_MAX_QUANTITY = 1_000_000;

export const COMMERCE_REVIEW_TEXT_MAX_CHARS = 5_000;
export const COMMERCE_MEDIA_ALT_TEXT_MAX_CHARS = 300;
export const COMMERCE_CATALOG_SKELETON_COUNT = 8;

export const COMMERCE_CATEGORIES = [
  { id: 'fashion', label: 'Fashion' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'home', label: 'Home' },
  { id: 'collectibles', label: 'Collectibles' },
] as const;
