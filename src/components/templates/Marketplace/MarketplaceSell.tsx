'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { APP_ROUTES, getMarketplaceListingRoute } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useCreateMarketplaceListing } from '@/hooks/useCreateMarketplaceListing/useCreateMarketplaceListing';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceListingForm } from '@/organisms/Marketplace/MarketplaceListingForm';

export function MarketplaceSell() {
  const router = useRouter();
  const listing = useCreateMarketplaceListing();
  const [isPublishing, setIsPublishing] = useState(false);

  const submit = async () => {
    setIsPublishing(true);
    try {
      const compositeId = await listing.submit();
      if (!compositeId) return;
      const separator = compositeId.indexOf(':');
      router.push(getMarketplaceListingRoute(compositeId.slice(0, separator), compositeId.slice(separator + 1)));
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28 lg:pb-16"
      classNameWrapperContent="max-w-4xl"
    >
      <Container overrideDefaults className="flex w-full flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          href={APP_ROUTES.MARKETPLACE}
          overrideDefaults
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Marketplace
        </Link>

        <div>
          <Badge className="mb-4">Seller studio</Badge>
          <Heading level={1} size="xl" className="text-4xl sm:text-6xl">
            Create a listing
          </Heading>
          <Typography as="p" className="mt-3 max-w-2xl text-muted-foreground">
            Publish owner-signed item terms, inventory, delivery, returns, and either a fixed price or seven-day
            auction.
          </Typography>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-brand" />
            Drafts autosave locally. Images are sanitized and BLAKE3 hashed before upload.
          </div>
        </div>

        <MarketplaceListingForm
          form={listing.form}
          media={listing.media}
          onSubmit={submit}
          isPublishing={isPublishing}
        />
      </Container>
    </ContentLayout>
  );
}
