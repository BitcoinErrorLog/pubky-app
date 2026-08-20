import { MarketplaceShop } from '@/templates/Marketplace/MarketplaceShop';

export interface MarketplaceShopPageProps {
  params: Promise<{
    sellerPubky: string;
  }>;
}

export default async function MarketplaceShopPage({ params }: MarketplaceShopPageProps) {
  const { sellerPubky } = await params;
  return <MarketplaceShop sellerPubky={sellerPubky} />;
}
