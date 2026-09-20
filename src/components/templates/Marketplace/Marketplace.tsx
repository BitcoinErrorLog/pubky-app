'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowRight, Gavel, ShieldCheck, Store, X } from 'lucide-react';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { isDurableCommerceMode } from '@/config/commerce';
import { buildFeatureDiscoveryDeviceStorageKey, MARKETPLACE_PROMO_STORAGE_ID } from '@/config/featureDiscovery';
import { useMarketplaceCatalog } from '@/hooks/useMarketplaceCatalog/useMarketplaceCatalog';
import type { MarketplaceCatalogItem } from '@/hooks/useMarketplaceCatalog/useMarketplaceCatalog.utils';
import { useMarketplacePromoDismissal } from '@/hooks/useMarketplacePromoDismissal/useMarketplacePromoDismissal';
import { useMarketplaceWatchDetection } from '@/hooks/useMarketplaceWatchDetection/useMarketplaceWatchDetection';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import type { CommerceShopRecord } from '@/libs/commerce/marketplace-records';
import { getDeployEnv } from '@/libs/runtime-config/runtime-config';
import { cn } from '@/libs/utils/utils';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceDropsShelfEntry } from '@/organisms/Marketplace/MarketplaceDropsShelfEntry';
import { MarketplaceFilters } from '@/organisms/Marketplace/MarketplaceFilters';
import { MarketplaceListingCard } from '@/organisms/Marketplace/MarketplaceListingCard';
import { MarketplaceSectionNav } from '@/organisms/Marketplace/MarketplaceSectionNav';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import { MarketplaceSkeleton } from './Marketplace.skeleton';

const MARKETPLACE_PROMO_DEVICE_STORAGE_KEY = buildFeatureDiscoveryDeviceStorageKey(MARKETPLACE_PROMO_STORAGE_ID);

export function Marketplace({
  initialListings = [],
  initialShops = [],
}: {
  initialListings?: MarketplaceCatalogItem[];
  initialShops?: CommerceShopRecord[];
}) {
  const router = useRouter();
  const { requireAuth } = useRequireAuth();
  const layout = useCommerceStore((state) => state.layout);
  const setSaleFormat = useCommerceStore((state) => state.setSaleFormat);
  const catalog = useMarketplaceCatalog(initialListings, initialShops);
  const { shopsBySeller, adapterMode, listings, facetPool, countryFacetPool } = catalog;
  const isStaging = getDeployEnv() === 'staging';
  const isLoading = catalog.isLoading && listings.length === 0;
  const { showPromo, dismissPromo } = useMarketplacePromoDismissal();
  const [promoStorageHydrated, setPromoStorageHydrated] = useState(false);
  const [isPromoDismissedOnDevice, setIsPromoDismissedOnDevice] = useState(false);
  // Visiting the marketplace (or refocusing its tab) runs the bounded
  // watchlist detection pass — the app has no background daemon.
  useMarketplaceWatchDetection();
  const shouldShowPromo = showPromo && promoStorageHydrated && !isPromoDismissedOnDevice;

  useEffect(() => {
    try {
      setIsPromoDismissedOnDevice(window.localStorage.getItem(MARKETPLACE_PROMO_DEVICE_STORAGE_KEY) === 'dismissed');
    } catch {
      setIsPromoDismissedOnDevice(false);
    } finally {
      setPromoStorageHydrated(true);
    }
  }, []);

  const dismissMarketplacePromo = () => {
    dismissPromo();
    setIsPromoDismissedOnDevice(true);
    try {
      window.localStorage.setItem(MARKETPLACE_PROMO_DEVICE_STORAGE_KEY, 'dismissed');
    } catch {
      // The in-memory state still hides the promo for this tab.
    }
  };

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28 lg:pb-16"
      classNameWrapperContent="max-w-7xl"
    >
      <Container overrideDefaults className="flex w-full flex-col gap-6">
        {isStaging && (
          <div
            role="note"
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          >
            Staging environment — test rails, no real funds move
          </div>
        )}
        <section aria-label="Marketplace tools" className="flex flex-col gap-5 rounded-2xl bg-card p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Heading level={1} size="lg" className="text-2xl">
              Marketplace
            </Heading>
            <div className="flex flex-wrap gap-2">
              <Button className="rounded-full" onClick={() => requireAuth(() => router.push(MARKETPLACE_ROUTES.SELL))}>
                <Store className="size-4" />
                Sell an item
              </Button>
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={() => {
                  setSaleFormat('auction');
                  document.getElementById('marketplace-catalog')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <Gavel className="size-4" />
                Browse auctions
              </Button>
            </div>
          </div>
          <MarketplaceSectionNav onNavigate={(href) => requireAuth(() => router.push(href))} />
        </section>

        {/* Drops entry (ADR 0026): durable modes only — drops are enforced by
            the transaction service's clock, so the shelf never appears where
            no such authority exists. */}
        {isDurableCommerceMode(adapterMode) && <MarketplaceDropsShelfEntry />}

        {shouldShowPromo && (
          <section aria-label="Marketplace promo" className="relative overflow-hidden rounded-2xl bg-card p-6 sm:p-10">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss marketplace promo"
              onClick={dismissMarketplacePromo}
              className="absolute top-2 right-2 z-10 size-8 text-muted-foreground hover:text-foreground sm:top-3 sm:right-3 sm:size-10"
            >
              <X className="size-4" />
            </Button>
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              <div className="w-full min-w-0 flex-1">
                <Heading level={2} size="xl" className="pr-8 text-3xl leading-tight sm:text-4xl lg:pr-0 lg:text-5xl">
                  Find something rare. <span className="text-brand">Trade freely.</span>
                </Heading>
                <Typography as="p" className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                  Owner-signed listings, local-first discovery, offers and auctions—with payment-backed access powered
                  by Pubky.
                </Typography>
                <div className="mt-6 hidden w-full gap-6 sm:grid sm:grid-cols-3">
                  {[
                    { icon: Gavel, label: 'Fair auctions', detail: 'Verified bids. Clear outcomes.' },
                    {
                      icon: ShieldCheck,
                      label: 'Signed by owner',
                      detail: 'Listings remain tied to a Pubky identity.',
                    },
                    {
                      icon: ArrowRight,
                      label: 'Local first',
                      detail: 'Browse cached catalog records even when offline.',
                    },
                  ].map(({ icon: Icon, label, detail }) => (
                    <Card key={label} className="flex-row items-start gap-4 bg-background p-5">
                      <div className="rounded-full bg-brand/15 p-2 text-brand">
                        <Icon className="size-5" />
                      </div>
                      <div>
                        <Typography as="h3" className="font-semibold">
                          {label}
                        </Typography>
                        <Typography as="p" className="mt-1 text-sm text-muted-foreground">
                          {detail}
                        </Typography>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
              <Image
                src="/images/marketplace/marketplace-icon.png"
                alt=""
                width={1280}
                height={1280}
                sizes="(min-width: 1024px) 152px, (min-width: 640px) 112px, 144px"
                className="h-auto w-36 shrink-0 self-center sm:w-28 lg:w-38"
              />
            </div>
          </section>
        )}

        <section id="marketplace-catalog" className="flex scroll-mt-28 flex-col gap-6">
          <MarketplaceFilters resultCount={listings.length} facetPool={facetPool} countryFacetPool={countryFacetPool} />

          {adapterMode === 'unavailable' && (
            <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
              Marketplace transactions are unavailable in this deployment. Public browsing remains read-only.
            </div>
          )}

          {isLoading ? (
            <MarketplaceSkeleton />
          ) : listings.length > 0 ? (
            <div
              className={cn(
                layout === 'grid' ? 'grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4' : 'grid grid-cols-1 gap-6',
              )}
            >
              {listings.map((listing) => (
                <MarketplaceListingCard
                  key={listing.id}
                  listing={listing}
                  shopName={shopsBySeller.get(listing.sellerId)?.name}
                  layout={layout}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 p-8 text-center">
              <Store className="mb-4 size-10 text-muted-foreground" />
              <Heading level={2} size="md">
                No listings match
              </Heading>
              <Typography as="p" className="mt-2 text-muted-foreground">
                Try another search or clear the active filters.
              </Typography>
            </div>
          )}
        </section>
      </Container>
    </ContentLayout>
  );
}
