'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Gavel, Heart, MapPin, PackageCheck, ShieldCheck, Store } from 'lucide-react';
import { APP_ROUTES, getMarketplaceShopRoute } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { getCommerceAdapterMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useCommerceFavorite } from '@/hooks/useCommerceFavorite/useCommerceFavorite';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { formatCommerceCondition, formatCommerceMoney } from '@/libs/commerce/format';
import { toast } from '@/molecules/Toaster/use-toast';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceSkeleton } from './Marketplace.skeleton';

export interface MarketplaceListingProps {
  sellerPubky: string;
  listingId: string;
}

export function MarketplaceListing({ sellerPubky, listingId }: MarketplaceListingProps) {
  const { requireAuth } = useRequireAuth();
  const [error, setError] = useState<string | null>(null);
  const adapterMode = getCommerceAdapterMode();
  const favorite = useCommerceFavorite(`${sellerPubky}:${listingId}`);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      await CommerceController.initializeSandboxCatalog();
      if (adapterMode !== 'sandbox') {
        await CommerceController.getOrFetchListing(sellerPubky, listingId);
      }
    };
    initialize().catch(() => {
      if (active) setError('This listing could not be loaded.');
    });
    return () => {
      active = false;
    };
  }, [adapterMode, listingId, sellerPubky]);

  const listing = useLiveQuery(() => CommerceController.getListing(sellerPubky, listingId), [sellerPubky, listingId]);
  const shop = useLiveQuery(() => CommerceController.getShop(sellerPubky), [sellerPubky]);

  if (listing === undefined || shop === undefined) {
    return (
      <ContentLayout
        showLeftSidebar={false}
        showRightSidebar={false}
        showLeftMobileButton={false}
        showRightMobileButton={false}
      >
        <Container overrideDefaults className="w-full px-4 sm:px-6">
          <MarketplaceSkeleton count={1} />
        </Container>
      </ContentLayout>
    );
  }

  if (!listing || error) {
    return (
      <ContentLayout
        showLeftSidebar={false}
        showRightSidebar={false}
        showLeftMobileButton={false}
        showRightMobileButton={false}
      >
        <Container className="min-h-96 items-center justify-center px-6 text-center">
          <Store className="mb-4 size-12 text-muted-foreground" />
          <Heading level={1} size="lg">
            Listing unavailable
          </Heading>
          <Typography as="p" className="mt-2 text-muted-foreground">
            {error ?? 'This listing is no longer in the local marketplace catalog.'}
          </Typography>
          <Button asChild className="mt-6 rounded-full">
            <Link href={APP_ROUTES.MARKETPLACE} overrideDefaults>
              Back to marketplace
            </Link>
          </Button>
        </Container>
      </ContentLayout>
    );
  }

  const record = listing.record;
  const price = record.sale.format === 'fixed_price' ? record.sale.unitPrice : record.sale.startingPrice;
  const actionLabel = record.sale.format === 'auction' ? 'Place a bid' : 'Buy now';

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28 lg:pb-16"
      classNameWrapperContent="max-w-6xl"
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <div className="relative flex min-h-[440px] items-center justify-center overflow-hidden rounded-2xl border bg-linear-to-br from-brand/35 via-purple-500/15 to-card lg:min-h-[640px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.18),transparent_32%)]" />
            {record.sale.format === 'auction' ? (
              <Gavel className="size-32 text-foreground/75 drop-shadow-2xl" />
            ) : (
              <PackageCheck className="size-32 text-foreground/75 drop-shadow-2xl" />
            )}
            <Badge className="absolute top-4 left-4 bg-background/85 text-foreground backdrop-blur-md">
              {record.sale.format === 'auction' ? 'Live auction' : 'Buy now'}
            </Badge>
          </div>

          <div className="flex flex-col gap-5">
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{formatCommerceCondition(record.condition)}</Badge>
                {adapterMode === 'sandbox' && <Badge variant="outline">Sandbox · no real funds</Badge>}
              </div>
              <Heading level={1} size="xl" className="text-3xl leading-tight sm:text-5xl">
                {record.title}
              </Heading>
              <Typography as="p" className="mt-3 text-3xl font-bold text-brand">
                {record.sale.format === 'auction' ? 'Starting at ' : ''}
                {formatCommerceMoney(price)}
              </Typography>
            </div>

            <Card className="gap-4 border py-5">
              <CardContent className="flex items-center justify-between gap-4 px-5">
                <div>
                  <Typography as="p" className="text-sm text-muted-foreground">
                    Sold by
                  </Typography>
                  <Typography as="p" className="font-semibold">
                    {shop?.record.name ?? `${sellerPubky.slice(0, 10)}…`}
                  </Typography>
                </div>
                <Button asChild variant="secondary" size="sm" className="rounded-full">
                  <Link href={getMarketplaceShopRoute(sellerPubky)} overrideDefaults>
                    View shop
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Typography as="p" className="text-base leading-7 text-muted-foreground">
              {record.description}
            </Typography>

            <div className="flex flex-wrap gap-2">
              {record.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  #{tag}
                </Badge>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <MapPin className="size-5 text-brand" />
                <div>
                  <Typography as="p" className="text-sm font-semibold">
                    Ships from
                  </Typography>
                  <Typography as="p" className="text-sm text-muted-foreground">
                    {record.location.region ? `${record.location.region}, ` : ''}
                    {record.location.countryCode}
                  </Typography>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <ShieldCheck className="size-5 text-brand" />
                <div>
                  <Typography as="p" className="text-sm font-semibold">
                    Owner-signed
                  </Typography>
                  <Typography as="p" className="text-sm text-muted-foreground">
                    Revision {record.revision}
                  </Typography>
                </div>
              </div>
            </div>

            <div className="mt-auto flex gap-3">
              <Button
                size="lg"
                className="flex-1 rounded-full"
                disabled={adapterMode === 'unavailable'}
                onClick={() =>
                  requireAuth(() =>
                    toast({
                      variant: 'info',
                      title: 'Sandbox transaction',
                      description: 'Checkout and bidding are connected in the next transaction slice.',
                    }),
                  )
                }
              >
                {actionLabel}
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="rounded-full"
                aria-label={favorite.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                aria-pressed={favorite.isFavorite}
                disabled={favorite.isMutating}
                onClick={favorite.toggle}
              >
                <Heart className={favorite.isFavorite ? 'fill-brand text-brand' : ''} />
              </Button>
            </div>
            {adapterMode === 'unavailable' && (
              <Typography as="p" className="text-center text-sm text-muted-foreground">
                Transactions are disabled in this deployment.
              </Typography>
            )}
          </div>
        </div>
      </Container>
    </ContentLayout>
  );
}
