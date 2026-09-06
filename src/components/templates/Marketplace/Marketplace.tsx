'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bell,
  Gavel,
  HandCoins,
  Heart,
  LayoutDashboard,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Store,
  X,
} from 'lucide-react';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { isDurableCommerceMode } from '@/config/commerce';
import { buildFeatureDiscoveryDeviceStorageKey, MARKETPLACE_PROMO_STORAGE_ID } from '@/config/featureDiscovery';
import { useMarketplaceActivityUnread } from '@/hooks/useMarketplaceActivityUnread/useMarketplaceActivityUnread';
import { useMarketplaceCartCount } from '@/hooks/useMarketplaceCartCount/useMarketplaceCartCount';
import { useMarketplaceCatalog } from '@/hooks/useMarketplaceCatalog/useMarketplaceCatalog';
import type { MarketplaceCatalogItem } from '@/hooks/useMarketplaceCatalog/useMarketplaceCatalog.utils';
import { useMarketplacePromoDismissal } from '@/hooks/useMarketplacePromoDismissal/useMarketplacePromoDismissal';
import { useMarketplaceWatchDetection } from '@/hooks/useMarketplaceWatchDetection/useMarketplaceWatchDetection';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn } from '@/libs/utils/utils';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceBuyerToolsSheet } from '@/organisms/Marketplace/MarketplaceBuyerToolsSheet';
import { MarketplaceDropsShelfEntry } from '@/organisms/Marketplace/MarketplaceDropsShelfEntry';
import { MarketplaceFilters } from '@/organisms/Marketplace/MarketplaceFilters';
import { MarketplaceListingCard } from '@/organisms/Marketplace/MarketplaceListingCard';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import { MarketplaceSkeleton } from './Marketplace.skeleton';

const MARKETPLACE_PROMO_DEVICE_STORAGE_KEY = buildFeatureDiscoveryDeviceStorageKey(MARKETPLACE_PROMO_STORAGE_ID);

export function Marketplace({ initialListings = [] }: { initialListings?: MarketplaceCatalogItem[] }) {
  const router = useRouter();
  const { requireAuth } = useRequireAuth();
  const layout = useCommerceStore((state) => state.layout);
  const setSaleFormat = useCommerceStore((state) => state.setSaleFormat);
  const catalog = useMarketplaceCatalog();
  const { shopsBySeller, adapterMode } = catalog;
  const isLoading = catalog.isLoading && initialListings.length === 0;
  const listings = catalog.isLoading ? initialListings : catalog.listings;
  const facetPool = catalog.isLoading ? initialListings : catalog.facetPool;
  const { showPromo, dismissPromo } = useMarketplacePromoDismissal();
  const [promoStorageHydrated, setPromoStorageHydrated] = useState(false);
  const [isPromoDismissedOnDevice, setIsPromoDismissedOnDevice] = useState(false);
  // Honest badges (see the hooks' contracts): the cart count is exactly what
  // the cart page shows; the activity count is device-local unread — never a
  // server-claimed read state, which the durable service does not have.
  const cartCount = useMarketplaceCartCount();
  const activityUnreadCount = useMarketplaceActivityUnread();
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
      <Container overrideDefaults className="flex w-full flex-col gap-5 px-4 sm:gap-8 sm:px-6 lg:px-8">
        <section aria-label="Marketplace tools" className="flex flex-col gap-4 rounded-2xl border bg-card p-3 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Heading level={1} size="lg" className="text-2xl">
              Marketplace
            </Heading>
            {adapterMode === 'sandbox' && (
              <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-300">
                Sandbox · no real funds
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
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
            <div className="md:hidden" data-testid="marketplace-mobile-tools">
              <MarketplaceBuyerToolsSheet
                cartCount={cartCount}
                activityUnreadCount={activityUnreadCount}
                onNavigate={(href) => requireAuth(() => router.push(href))}
              />
            </div>
            <div className="hidden flex-wrap gap-2 sm:gap-3 md:flex" data-testid="marketplace-desktop-tools">
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
                onClick={() => requireAuth(() => router.push(MARKETPLACE_ROUTES.WATCHLIST))}
              >
                <Heart className="mr-2 size-4" />
                Watchlist
              </Button>
              <span className="relative inline-flex">
                <Button
                  variant="ghost"
                  className="rounded-full"
                  aria-label={cartCount > 0 ? `Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}` : undefined}
                  onClick={() => requireAuth(() => router.push(MARKETPLACE_ROUTES.CART))}
                >
                  <ShoppingCart className="mr-2 size-4" />
                  Cart
                </Button>
                <NavPillCountBadge count={cartCount} dataCy="marketplace-nav-cart" />
              </span>
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={() => requireAuth(() => router.push(MARKETPLACE_ROUTES.ORDERS))}
              >
                <ReceiptText className="mr-2 size-4" />
                Orders
              </Button>
              <span className="relative inline-flex">
                <Button
                  variant="ghost"
                  className="rounded-full"
                  aria-label={activityUnreadCount > 0 ? `Activity, ${activityUnreadCount} unread` : undefined}
                  onClick={() => requireAuth(() => router.push(MARKETPLACE_ROUTES.NOTIFICATIONS))}
                >
                  <Bell className="mr-2 size-4" />
                  Activity
                </Button>
                <NavPillCountBadge count={activityUnreadCount} dataCy="marketplace-nav-activity" />
              </span>
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={() => requireAuth(() => router.push(MARKETPLACE_ROUTES.DASHBOARD))}
              >
                <LayoutDashboard className="mr-2 size-4" />
                Seller studio
              </Button>
            </div>
          </div>
        </section>

        {/* Drops entry (ADR 0026): durable modes only — drops are enforced by
            the transaction service's clock, so the shelf never appears where
            no such authority exists. */}
        {isDurableCommerceMode(adapterMode) && <MarketplaceDropsShelfEntry />}

        {shouldShowPromo && (
          <section
            aria-label="Marketplace promo"
            className="relative overflow-hidden rounded-2xl border border-brand/20 bg-linear-to-br from-brand/20 via-card to-card p-3 sm:p-10"
          >
            <div className="absolute -top-24 -right-20 hidden size-64 rounded-full bg-brand/20 blur-3xl sm:block" />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss marketplace promo"
              onClick={dismissMarketplacePromo}
              className="absolute top-2 right-2 z-10 size-8 text-muted-foreground hover:text-foreground sm:top-3 sm:right-3 sm:size-10"
            >
              <X className="size-4" />
            </Button>
            <div className="relative flex flex-col items-start gap-2 sm:gap-5">
              <Badge className="hidden bg-brand text-primary-foreground sm:inline-flex">Pubky Marketplace</Badge>
              <Heading level={2} size="xl" className="max-w-2xl pr-10 text-base leading-5 sm:text-6xl sm:leading-tight">
                Find something rare.
                <span className="text-brand"> Trade without the feed.</span>
              </Heading>
              <Typography
                as="p"
                className="hidden max-w-2xl text-base leading-7 text-muted-foreground sm:block sm:text-lg"
              >
                Owner-signed listings, local-first discovery, offers and auctions—with payment-backed access powered by
                Pubky.
              </Typography>
              <div className="hidden w-full gap-3 sm:grid sm:grid-cols-3">
                {[
                  { icon: ShieldCheck, label: 'Owner-signed', detail: 'Listings remain tied to a Pubky identity.' },
                  { icon: Gavel, label: 'Fair auctions', detail: 'Server-authoritative bids and deterministic close.' },
                  {
                    icon: ArrowRight,
                    label: 'Local-first',
                    detail: 'Browse cached catalog records even when offline.',
                  },
                ].map(({ icon: Icon, label, detail }) => (
                  <div key={label} className="flex items-start gap-3 rounded-xl border bg-card/70 p-4">
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
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section id="marketplace-catalog" className="flex scroll-mt-28 flex-col gap-5">
          <MarketplaceFilters resultCount={listings.length} facetPool={facetPool} />

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

/**
 * The header navigation's honest unread badge, mirrored for the marketplace
 * nav pills: same atoms, placement, and 21+ cap; zero renders nothing.
 */
function NavPillCountBadge({ count, dataCy }: { count: number; dataCy: string }) {
  if (count <= 0) return null;
  return (
    <Badge
      data-cy={`${dataCy}-counter`}
      className="absolute -right-1 -bottom-1 h-5 w-5 rounded-full bg-brand shadow-sm"
      variant="secondary"
    >
      <Typography className={cn('font-semibold text-primary-foreground', count > 21 && 'text-xs')} size="xs">
        {count > 21 ? '21+' : count}
      </Typography>
    </Badge>
  );
}
