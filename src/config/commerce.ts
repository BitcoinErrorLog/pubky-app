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
