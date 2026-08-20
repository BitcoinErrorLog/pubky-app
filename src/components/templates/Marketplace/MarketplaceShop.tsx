'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, MapPin, Store, UserCheck, UserPlus } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useCommerceShopFollow } from '@/hooks/useCommerceShopFollow/useCommerceShopFollow';
import { buildMarketplaceCatalogItems } from '@/hooks/useMarketplaceCatalog/useMarketplaceCatalog.utils';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceListingCard } from '@/organisms/Marketplace/MarketplaceListingCard';
import { MarketplaceSkeleton } from './Marketplace.skeleton';

export function MarketplaceShop({ sellerPubky }: { sellerPubky: string }) {
  const follow = useCommerceShopFollow(sellerPubky);

  const shop = useLiveQuery(() => CommerceController.getShop(sellerPubky), [sellerPubky]);
  // Same two catalog sources as the home grid: hydrated canonical records
  // plus Nexus index projections discovered for this seller.
  const sellerListings = useLiveQuery(() => CommerceController.getListingsBySeller(sellerPubky), [sellerPubky]);
  const sellerEntries = useLiveQuery(() => CommerceController.getCatalogEntriesBySeller(sellerPubky), [sellerPubky]);
  const listings =
    sellerListings === undefined || sellerEntries === undefined
      ? undefined
      : buildMarketplaceCatalogItems(sellerListings, sellerEntries);

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28 lg:pb-16"
      classNameWrapperContent="max-w-7xl"
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

        {shop === undefined || listings === undefined ? (
          <MarketplaceSkeleton count={4} />
        ) : shop ? (
          <>
            <Card className="overflow-hidden border py-0">
              <div className="h-28 bg-linear-to-r from-brand/40 via-purple-500/20 to-cyan-500/20 sm:h-40" />
              <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="-mt-16">
                  <div className="mb-4 flex size-20 items-center justify-center rounded-2xl border-4 border-card bg-brand text-primary-foreground shadow-lg">
                    <Store className="size-9" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Heading level={1} size="xl" className="text-3xl sm:text-5xl">
                      {shop.record.name}
                    </Heading>
                    {shop.record.vacationMode && <Badge variant="secondary">Vacation mode</Badge>}
                  </div>
                  <Typography as="p" className="mt-2 max-w-2xl text-muted-foreground">
                    {shop.record.bio}
                  </Typography>
                  <Typography as="p" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="size-4" />
                    {shop.record.location.region ? `${shop.record.location.region}, ` : ''}
                    {shop.record.location.countryCode}
                  </Typography>
                </div>
                <div className="flex flex-col items-start gap-4 sm:items-end">
                  <Button
                    variant={follow.isFollowing ? 'default' : 'secondary'}
                    className="rounded-full"
                    aria-pressed={follow.isFollowing}
                    disabled={follow.isMutating}
                    onClick={follow.toggle}
                  >
                    {follow.isFollowing ? <UserCheck className="mr-2 size-4" /> : <UserPlus className="mr-2 size-4" />}
                    {follow.isFollowing ? 'Following' : 'Follow shop'}
                  </Button>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <Typography as="p" className="text-2xl font-bold">
                        {listings.length}
                      </Typography>
                      <Typography as="p" className="text-muted-foreground">
                        Listings
                      </Typography>
                    </div>
                    <div>
                      <Typography as="p" className="text-2xl font-bold">
                        Yes
                      </Typography>
                      <Typography as="p" className="text-muted-foreground">
                        Owner-signed
                      </Typography>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
              {listings.map((listing) => (
                <MarketplaceListingCard key={listing.id} listing={listing} shopName={shop.record.name} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex min-h-96 flex-col items-center justify-center rounded-xl border border-dashed text-center">
            <Store className="mb-4 size-10 text-muted-foreground" />
            <Heading level={1} size="lg">
              Shop unavailable
            </Heading>
          </div>
        )}
      </Container>
    </ContentLayout>
  );
}
