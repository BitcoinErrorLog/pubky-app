import { MarketplaceEditListing } from '@/templates/Marketplace/MarketplaceEditListing';

export interface MarketplaceEditListingPageProps {
  params: Promise<{
    sellerPubky: string;
    listingId: string;
  }>;
}

export default async function MarketplaceEditListingPage({ params }: MarketplaceEditListingPageProps) {
  const { sellerPubky, listingId } = await params;
  return <MarketplaceEditListing sellerPubky={sellerPubky} listingId={listingId} />;
}
