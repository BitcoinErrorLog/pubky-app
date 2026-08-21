'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Download, Package, Pause, PencilLine, Play, ShoppingBag, Store, TrendingUp } from 'lucide-react';
import {
  APP_ROUTES,
  getMarketplaceListingEditRoute,
  getMarketplaceListingRoute,
  MARKETPLACE_ROUTES,
} from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Checkbox } from '@/atoms/Checkbox/Checkbox';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { getCommerceAdapterMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceSellerDashboard } from '@/hooks/useMarketplaceSellerDashboard/useMarketplaceSellerDashboard';
import { formatCommerceMoney } from '@/libs/commerce/format';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceSessionRequiredCard } from '@/organisms/Marketplace/MarketplaceSessionRequiredCard';
import { useAuthStore } from '@/stores/auth/auth.store';

export function MarketplaceDashboard() {
  const dashboard = useMarketplaceSellerDashboard();
  const [selected, setSelected] = useState<string[]>([]);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  // Normalize "no record" to null so `undefined` keeps meaning "still loading".
  const shop = useLiveQuery(
    () => (currentUserPubky ? CommerceController.getShop(currentUserPubky).then((found) => found ?? null) : null),
    [currentUserPubky],
  );
  const [shopFetchSettled, setShopFetchSettled] = useState(false);

  useEffect(() => {
    if (!currentUserPubky) return;
    let active = true;
    setShopFetchSettled(false);
    CommerceController.getOrFetchShop(currentUserPubky)
      .catch(() => undefined)
      .finally(() => {
        if (active) setShopFetchSettled(true);
      });
    return () => {
      active = false;
    };
  }, [currentUserPubky]);

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([dashboard.exportCsv()], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'pubky-marketplace-inventory.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28"
      classNameWrapperContent="max-w-7xl"
    >
      <Container overrideDefaults className="flex w-full flex-col gap-6 px-4 sm:px-6">
        <Link
          href={APP_ROUTES.MARKETPLACE}
          overrideDefaults
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          Marketplace
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Heading level={1} size="xl" className="text-4xl sm:text-6xl">
              Seller dashboard
            </Heading>
            <Typography as="p" className="mt-2 text-muted-foreground">
              Your listings, shop, order work queues, and offers.
            </Typography>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="rounded-full">
              <Link href={MARKETPLACE_ROUTES.SELL} overrideDefaults>
                Sell an item
              </Link>
            </Button>
            <Button asChild variant="secondary" className="rounded-full">
              <Link href={MARKETPLACE_ROUTES.MY_SHOP} overrideDefaults>
                <Store className="mr-2 size-4" />
                My shop
              </Link>
            </Button>
            <Button asChild variant="secondary" className="rounded-full">
              <Link href={MARKETPLACE_ROUTES.ORDERS} overrideDefaults>
                Orders
              </Link>
            </Button>
            <Button asChild variant="secondary" className="rounded-full">
              <Link href={MARKETPLACE_ROUTES.OFFERS} overrideDefaults>
                Offers
              </Link>
            </Button>
            <Button asChild variant="ghost" className="rounded-full">
              <Link href={MARKETPLACE_ROUTES.SETTINGS} overrideDefaults>
                Payment settings
              </Link>
            </Button>
          </div>
        </div>

        {dashboard.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            {/* A seller with published listings but no shop record dead-ends
                every buyer who taps "View shop" — surface that here, where
                sellers actually work. */}
            {shopFetchSettled && shop === null && dashboard.listings.length > 0 && (
              <Card className="border border-brand/40 bg-brand/5">
                <CardContent className="flex flex-col gap-3 px-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Typography as="h2" className="font-semibold">
                      Your shop page is not set up
                    </Typography>
                    <Typography as="p" className="text-sm text-muted-foreground">
                      Buyers who open your listings see only your key. Add a shop name, bio, and policies.
                    </Typography>
                  </div>
                  <Button asChild className="shrink-0 rounded-full">
                    <Link href={MARKETPLACE_ROUTES.MY_SHOP} overrideDefaults>
                      <Store className="mr-2 size-4" />
                      Set up your shop
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
            {/* Local listings stay real without a session, but orders/offers
                come from the durable service — without a session the work
                queues and revenue below would silently read as zero, so say
                so and offer the connect affordance instead. */}
            {dashboard.needsSession && dashboard.sessionError && (
              <MarketplaceSessionRequiredCard message={dashboard.sessionError} />
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: 'Active listings', value: dashboard.metrics.activeListings, icon: ShoppingBag },
                { label: 'Inventory', value: dashboard.metrics.totalInventory, icon: Package },
                { label: 'Low stock', value: dashboard.metrics.lowStock, icon: Package },
                { label: 'Paid orders', value: dashboard.metrics.paidOrders, icon: TrendingUp },
                {
                  // In sandbox mode this number is simulated and must say so;
                  // in the durable modes it reflects real orders. One figure
                  // per pricing asset — never a cross-asset sum.
                  label: getCommerceAdapterMode() === 'sandbox' ? 'Sandbox revenue' : 'Revenue',
                  value: dashboard.metrics.revenue.length
                    ? dashboard.metrics.revenue.map(formatCommerceMoney).join(' + ')
                    : formatCommerceMoney({ amountMinor: 0, currency: 'USD', exponent: 2 }),
                  icon: TrendingUp,
                },
              ].map(({ label, value, icon: Icon }) => (
                <Card key={label} className="gap-3 border py-4">
                  <CardContent className="px-4">
                    <Icon className="mb-3 size-5 text-brand" />
                    <Typography as="p" className="text-2xl font-bold">
                      {value}
                    </Typography>
                    <Typography as="p" className="text-sm text-muted-foreground">
                      {label}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border">
              <CardContent className="grid gap-4 px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Typography as="h2" className="text-xl font-semibold">
                      My listings
                    </Typography>
                    <Typography as="p" className="text-sm text-muted-foreground">
                      {dashboard.metrics.openOffers} open offers need attention.
                    </Typography>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-full"
                      disabled={!selected.length}
                      onClick={() => void dashboard.updateListingState(selected, 'paused')}
                    >
                      <Pause className="mr-2 size-4" />
                      Pause
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-full"
                      disabled={!selected.length}
                      onClick={() => void dashboard.updateListingState(selected, 'active')}
                    >
                      <Play className="mr-2 size-4" />
                      Activate
                    </Button>
                    <Button size="sm" variant="secondary" className="rounded-full" onClick={exportCsv}>
                      <Download className="mr-2 size-4" />
                      Export CSV
                    </Button>
                  </div>
                </div>

                {dashboard.listings.length === 0 ? (
                  <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 p-8 text-center">
                    <ShoppingBag className="mb-4 size-10 text-muted-foreground" />
                    <Heading level={3} size="md">
                      You have no listings yet
                    </Heading>
                    <Typography as="p" className="mt-2 text-muted-foreground">
                      Publish your first item — it appears here with its state, inventory, and actions.
                    </Typography>
                    <Button asChild className="mt-6 rounded-full">
                      <Link href={MARKETPLACE_ROUTES.SELL} overrideDefaults>
                        Sell an item
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-2xl text-left text-sm">
                      <thead className="text-muted-foreground">
                        <tr className="border-b">
                          <th className="p-3">
                            <span className="sr-only">Select</span>
                          </th>
                          <th className="p-3">Listing</th>
                          <th className="p-3">State</th>
                          <th className="p-3">Format</th>
                          <th className="p-3">Inventory</th>
                          <th className="p-3">Price</th>
                          <th className="p-3">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.listings.map((listing) => {
                          const checked = selected.includes(listing.id);
                          return (
                            <tr key={listing.id} className="border-b last:border-0">
                              <td className="p-3">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(next) =>
                                    setSelected((current) =>
                                      next ? [...current, listing.id] : current.filter((id) => id !== listing.id),
                                    )
                                  }
                                  aria-label={`Select ${listing.record.title}`}
                                />
                              </td>
                              <td className="p-3 font-semibold">
                                <Link
                                  href={getMarketplaceListingRoute(listing.seller_id, listing.listing_id)}
                                  overrideDefaults
                                  className="hover:text-brand hover:underline"
                                >
                                  {listing.record.title}
                                </Link>
                              </td>
                              <td className="p-3">
                                <Badge variant="secondary">{listing.state}</Badge>
                              </td>
                              <td className="p-3">{listing.format.replace('_', ' ')}</td>
                              <td className="p-3">
                                {listing.record.variants.reduce((total, variant) => total + variant.quantity, 0)}
                              </td>
                              <td className="p-3">
                                {/* The record's own price money: the model row's
                                    `price_minor` has no exponent column, and
                                    assuming 2 misstates satoshi-priced listings. */}
                                {formatCommerceMoney(
                                  listing.record.sale.format === 'fixed_price'
                                    ? listing.record.sale.unitPrice
                                    : listing.record.sale.startingPrice,
                                )}
                              </td>
                              <td className="p-3">
                                <Button asChild size="sm" variant="ghost" className="rounded-full">
                                  <Link
                                    href={getMarketplaceListingEditRoute(listing.seller_id, listing.listing_id)}
                                    overrideDefaults
                                  >
                                    <PencilLine className="mr-2 size-4" />
                                    Edit
                                  </Link>
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </Container>
    </ContentLayout>
  );
}
