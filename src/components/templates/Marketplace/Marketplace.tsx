'use client';

import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bell,
  Gavel,
  HandCoins,
  LayoutDashboard,
  MessageCircle,
  ShieldCheck,
  ShoppingCart,
  Store,
} from 'lucide-react';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceCatalog } from '@/hooks/useMarketplaceCatalog/useMarketplaceCatalog';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn } from '@/libs/utils/utils';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceFilters } from '@/organisms/Marketplace/MarketplaceFilters';
import { MarketplaceListingCard } from '@/organisms/Marketplace/MarketplaceListingCard';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import { MarketplaceSkeleton } from './Marketplace.skeleton';

export function Marketplace() {
  const router = useRouter();
  const { requireAuth } = useRequireAuth();
  const layout = useCommerceStore((state) => state.layout);
  const setSaleFormat = useCommerceStore((state) => state.setSaleFormat);
  const { listings, shopsBySeller, isLoading, adapterMode } = useMarketplaceCatalog();

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28 lg:pb-16"
      classNameWrapperContent="max-w-7xl"
    >
      <Container overrideDefaults className="flex w-full flex-col gap-8 px-4 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-2xl border border-brand/20 bg-linear-to-br from-brand/20 via-card to-card p-6 sm:p-10">
          <div className="absolute -top-24 -right-20 size-64 rounded-full bg-brand/20 blur-3xl" />
          <div className="relative flex flex-col items-start gap-5 lg:max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-brand text-primary-foreground">Pubky Marketplace</Badge>
              {adapterMode === 'sandbox' && (
                <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-300">
                  Sandbox · no real funds
                </Badge>
              )}
            </div>
            <Heading level={1} size="xl" className="max-w-2xl text-4xl leading-tight sm:text-6xl">
              Find something rare.
              <span className="text-brand"> Trade without the feed.</span>
            </Heading>
            <Typography as="p" className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Owner-signed listings, local-first discovery, offers and auctions—with payment-backed access powered by
              Pubky.
            </Typography>
            <div className="flex flex-wrap gap-3">
              <Button className="rounded-full" onClick={() => requireAuth(() => router.push(MARKETPLACE_ROUTES.SELL))}>
                <Store className="mr-2 size-4" />
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
                <Gavel className="mr-2 size-4" />
                Browse auctions
              </Button>
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={() => requireAuth(() => router.push(MARKETPLACE_ROUTES.MESSAGES))}
              >
                <MessageCircle className="mr-2 size-4" />
                Messages
              </Button>
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={() => requireAuth(() => router.push(MARKETPLACE_ROUTES.OFFERS))}
              >
                <HandCoins className="mr-2 size-4" />
                Offers
              </Button>
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={() => requireAuth(() => router.push(MARKETPLACE_ROUTES.CART))}
              >
                <ShoppingCart className="mr-2 size-4" />
                Cart
              </Button>
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={() => requireAuth(() => router.push(MARKETPLACE_ROUTES.NOTIFICATIONS))}
              >
                <Bell className="mr-2 size-4" />
                Activity
              </Button>
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={() => requireAuth(() => router.push(MARKETPLACE_ROUTES.DASHBOARD))}
              >
                <LayoutDashboard className="mr-2 size-4" />
                Seller dashboard
              </Button>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, label: 'Owner-signed', detail: 'Listings remain tied to a Pubky identity.' },
            { icon: Gavel, label: 'Fair auctions', detail: 'Server-authoritative bids and deterministic close.' },
            { icon: ArrowRight, label: 'Local-first', detail: 'Browse cached catalog records even when offline.' },
          ].map(({ icon: Icon, label, detail }) => (
            <div key={label} className="flex items-start gap-3 rounded-xl border bg-card/70 p-4">
              <div className="rounded-full bg-brand/15 p-2 text-brand">
                <Icon className="size-5" />
              </div>
              <div>
                <Typography as="h2" className="font-semibold">
                  {label}
                </Typography>
                <Typography as="p" className="mt-1 text-sm text-muted-foreground">
                  {detail}
                </Typography>
              </div>
            </div>
          ))}
        </div>

        <section id="marketplace-catalog" className="flex scroll-mt-28 flex-col gap-5">
          <MarketplaceFilters resultCount={listings.length} />

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
                layout === 'grid'
                  ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5'
                  : 'grid grid-cols-1 gap-3',
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
