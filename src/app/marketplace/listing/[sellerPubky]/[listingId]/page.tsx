import { MarketplaceListing } from '@/templates/Marketplace/MarketplaceListing';

export interface MarketplaceListingPageProps {
  params: Promise<{
    sellerPubky: string;
    listingId: string;
  }>;
}

export default async function MarketplaceListingPage({ params }: MarketplaceListingPageProps) {
  const { sellerPubky, listingId } = await params;
  return <MarketplaceListing sellerPubky={sellerPubky} listingId={listingId} />;
}
