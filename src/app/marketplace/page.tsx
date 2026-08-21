import type { Metadata as NextMetadata } from 'next';
import { APP_ROUTES } from '@/app/routes';
import { MARKETPLACE_STATIC_SEO } from '@/libs/commerce/seo';
import { Metadata } from '@/molecules/Metadata/Metadata';

export { Marketplace as default } from '@/templates/Marketplace/Marketplace';

/**
 * Static marketplace-specific metadata for the browse home. The preview image
 * is the branded card from this segment's `opengraph-image` file convention
 * (`omitImages`); auth-gated nested routes reference the same image route
 * explicitly via `gatedMarketplaceMetadata`.
 */
export function generateMetadata(): NextMetadata {
  const { openGraph, twitter, alternates } = Metadata({
    title: MARKETPLACE_STATIC_SEO.title,
    description: MARKETPLACE_STATIC_SEO.description,
    url: APP_ROUTES.MARKETPLACE,
    omitImages: true,
  });

  return {
    title: MARKETPLACE_STATIC_SEO.title,
    description: MARKETPLACE_STATIC_SEO.description,
    openGraph,
    twitter,
    alternates,
  };
}
