import type { Metadata as NextMetadata } from 'next';
import { getMarketplaceShopRoute } from '@/app/routes';
import { buildShopDescription, buildShopTitle, MARKETPLACE_STATIC_SEO } from '@/libs/commerce/seo';
import { fetchShopForMetadata } from '@/libs/og/ogCommerceData';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { MarketplaceShop } from '@/templates/Marketplace/MarketplaceShop';

export interface MarketplaceShopPageProps {
  params: Promise<{
    sellerPubky: string;
  }>;
}

/**
 * Dynamic metadata for a shop page, built strictly from the canonical
 * `shop.json` record on the seller's homeserver (deduped by the Data Cache
 * with the `opengraph-image` route). The preview image comes from the dynamic
 * `opengraph-image` / `twitter-image` file convention (`omitImages`). A
 * missing/unparseable record falls back to the static marketplace copy. A shop
 * with no bio emits `description: null` — suppressing the app's generic
 * tagline rather than inventing shop copy.
 */
export async function generateMetadata({ params }: MarketplaceShopPageProps): Promise<NextMetadata> {
  const { sellerPubky } = await params;
  const canonical = getMarketplaceShopRoute(sellerPubky);

  const fallback = () => {
    const { openGraph, twitter, alternates } = Metadata({
      title: MARKETPLACE_STATIC_SEO.title,
      description: MARKETPLACE_STATIC_SEO.description,
      url: canonical,
      omitImages: true,
    });
    return {
      title: MARKETPLACE_STATIC_SEO.title,
      description: MARKETPLACE_STATIC_SEO.description,
      openGraph,
      twitter,
      alternates,
    };
  };

  try {
    const shop = await fetchShopForMetadata(sellerPubky);
    if (!shop) return fallback();

    const title = buildShopTitle(shop);
    const description = buildShopDescription(shop);
    const { openGraph, twitter, alternates } = Metadata({ title, description, url: canonical, omitImages: true });

    return { title, description: description || null, openGraph, twitter, alternates };
  } catch {
    return fallback();
  }
}

export default async function MarketplaceShopPage({ params }: MarketplaceShopPageProps) {
  const { sellerPubky } = await params;
  return <MarketplaceShop sellerPubky={sellerPubky} />;
}
