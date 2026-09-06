'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, ReceiptText } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { isTransactionalCommerceMode } from '@/config/commerce';
import { useMarketplaceOrders } from '@/hooks/useMarketplaceOrders/useMarketplaceOrders';
import { buildCarrierTrackingUrl } from '@/libs/commerce/carriers';
import { formatCommerceMoney } from '@/libs/commerce/format';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { DropEditionBadge, DropEditionReceiptLine } from '@/organisms/Marketplace/DropEditionBadge';
import { MarketplaceIndicativePrice } from '@/organisms/Marketplace/MarketplaceIndicativePrice';
import { MarketplaceMyReviews } from '@/organisms/Marketplace/MarketplaceMyReviews';
import { MarketplaceOrderActions } from '@/organisms/Marketplace/MarketplaceOrderActions';
import { MarketplacePaymentStatusCard } from '@/organisms/Marketplace/MarketplacePaymentStatusCard';
import { MarketplaceReauthDialog } from '@/organisms/Marketplace/MarketplaceReauthDialog';
import { MarketplaceSessionRequiredCard } from '@/organisms/Marketplace/MarketplaceSessionRequiredCard';
import type { MarketplaceOrder } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCommerceStore } from '@/stores/commerce/commerce.store';

type OrdersTab = 'to_ship' | 'in_transit' | 'completed' | 'all';

const ORDER_TABS: { id: OrdersTab; label: string }[] = [
  { id: 'to_ship', label: 'To ship' },
  { id: 'in_transit', label: 'In transit' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
];

export function MarketplaceOrders() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const receiptsPublicationStatus = useCommerceStore((state) => state.receiptsPublicationStatus);
  const { orders, isLoading, error, needsSession, refresh, advancePayment, actOnOrder, adapterMode } =
    useMarketplaceOrders();
  const isSandbox = adapterMode === 'sandbox';
  const hasTransactionBackend = isTransactionalCommerceMode(adapterMode);
  const [activeTab, setActiveTab] = useState<OrdersTab>('all');
  const [hasSelectedTab, setHasSelectedTab] = useState(false);
  const orderCounts = getOrderTabCounts(orders, currentUserPubky);
  const visibleOrders = orders.filter(({ order }) => isOrderInTab(order, activeTab, currentUserPubky));

  useEffect(() => {
    if (hasSelectedTab || !orders.length) return;
    setActiveTab(orders.some(({ order }) => isCurrentUserSeller(order, currentUserPubky)) ? 'to_ship' : 'all');
  }, [currentUserPubky, hasSelectedTab, orders]);

  const chooseTab = (tab: OrdersTab) => {
    setHasSelectedTab(true);
    setActiveTab(tab);
  };

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28"
      classNameWrapperContent="max-w-5xl"
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
        <div>
          <Heading level={1} size="xl" className="text-4xl sm:text-6xl">
            Orders
          </Heading>
          <Typography as="p" className="mt-2 text-muted-foreground">
            {isSandbox
              ? 'Buyer and seller timelines with sandbox payment facts.'
              : 'Buyer and seller timelines from the durable transaction service.'}
          </Typography>
        </div>

        {!hasTransactionBackend ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
            <ReceiptText className="mb-3 size-10 text-muted-foreground" />
            <Heading level={2} size="md">
              Order timelines are not available here
            </Heading>
            <Typography as="p" className="mt-2 max-w-lg text-sm text-muted-foreground">
              This deployment runs no marketplace transaction backend — neither the sandbox nor the durable transaction
              service — so there is no order history to show, simulated or otherwise.
            </Typography>
          </div>
        ) : isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : needsSession && error ? (
          <MarketplaceSessionRequiredCard />
        ) : error ? (
          <div role="alert" className="rounded-xl border border-destructive/40 p-4">
            {error}
          </div>
        ) : orders.length ? (
          <>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Order filters">
              {ORDER_TABS.map((tab) => (
                <Button
                  key={tab.id}
                  type="button"
                  size="sm"
                  variant={activeTab === tab.id ? 'default' : 'ghost'}
                  className="rounded-full"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-label={`${tab.label} ${orderCounts[tab.id]}`}
                  onClick={() => chooseTab(tab.id)}
                >
                  {tab.label}
                  <span className="text-xs text-muted-foreground">{orderCounts[tab.id]}</span>
                </Button>
              ))}
            </div>
            <div className="grid gap-4">
              {visibleOrders.map(({ order, payment, receipt }) => {
                const isBuyer = currentUserPubky === order.buyerPubky;
                return (
                  <Card key={order.id} className="border py-5">
                    <CardContent className="grid gap-5 px-5 lg:grid-cols-[1fr_auto] lg:items-center">
                      <div>
                        <div className="mb-3 flex flex-wrap gap-2">
                          <Badge variant="outline" className="border-border/60 text-muted-foreground">
                            {isBuyer ? 'You bought' : 'You sold'}
                          </Badge>
                          <Badge variant="secondary">{order.state.replaceAll('_', ' ')}</Badge>
                          <DropEditionBadge order={order} />
                        </div>
                        {order.lines.map((line) => (
                          <div key={line.listingAggregateId}>
                            <Typography as="p" className="font-semibold">
                              {line.title} × {line.quantity}
                            </Typography>
                            {/* The buyer's variant snapshot from checkout. */}
                            {line.variantOptions?.length ? (
                              <Typography as="p" className="text-xs text-muted-foreground">
                                {line.variantOptions.map(({ name, value }) => `${name}: ${value}`).join(' · ')}
                              </Typography>
                            ) : null}
                          </div>
                        ))}
                        <Typography as="p" className="mt-2 text-2xl font-bold text-brand">
                          {formatCommerceMoney(order.total)}{' '}
                          <MarketplaceIndicativePrice money={order.total} className="text-sm font-normal" />
                        </Typography>
                        <Typography as="p" className="mt-1 text-xs text-muted-foreground">
                          Items {formatCommerceMoney(order.subtotal)} · Shipping {formatCommerceMoney(order.shipping)}
                        </Typography>
                        {receipt && (
                          <div className="mt-3 flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <ReceiptText className="size-4 text-brand" />
                              Receipt integrity {receipt.contentHash.slice(0, 12)}…
                            </div>
                            <DropEditionReceiptLine order={order} />
                            {receiptsPublicationStatus === 'needs_reauth' && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <Typography as="p" className="text-sm text-muted-foreground">
                                  Receipt not saved to your private storage yet — reconnect to save it
                                </Typography>
                                <MarketplaceReauthDialog triggerLabel="Sign in again" onReauthenticated={refresh} />
                              </div>
                            )}
                          </div>
                        )}
                        {order.shipment && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <Typography as="p">
                              {order.shipment.carrier} · {order.shipment.trackingNumber} · {order.shipment.state}
                            </Typography>
                            {/* Only carriers the curated registry can resolve get a
                              link — an unrecognized carrier stays plain text
                              instead of risking a dead tracking URL. */}
                            {(() => {
                              const trackingUrl = buildCarrierTrackingUrl(
                                order.shipment.carrier,
                                order.shipment.trackingNumber,
                              );
                              return trackingUrl ? (
                                <Link
                                  href={trackingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  overrideDefaults
                                  className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                                >
                                  Track package
                                  <ExternalLink className="size-3.5" />
                                </Link>
                              ) : null;
                            })()}
                          </div>
                        )}
                        {order.returnRequest && (
                          <Typography as="p" className="mt-2 text-sm text-muted-foreground">
                            Return {order.returnRequest.state}: {order.returnRequest.reason}
                          </Typography>
                        )}
                        {order.externalRefund && (
                          <Typography as="p" className="mt-2 text-sm text-brand">
                            {/* Only ever externally evidenced: Paykit Server cannot spend, so
                              the app records the seller's transaction evidence and never
                              claims it moved funds itself. */}
                            Refund recorded from external evidence: {order.externalRefund.transactionId}
                          </Typography>
                        )}
                        <div className="mt-4">
                          <MarketplacePaymentStatusCard
                            order={order}
                            payment={payment}
                            isBuyer={isBuyer}
                            adapterMode={adapterMode}
                            advancePayment={advancePayment}
                            onPaymentChanged={refresh}
                          />
                        </div>
                      </div>

                      <MarketplaceOrderActions
                        order={order}
                        isBuyer={isBuyer}
                        canEditReview={adapterMode === 'transaction-service'}
                        actOnOrder={actOnOrder}
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center">
            <ReceiptText className="mb-3 size-10 text-muted-foreground" />
            <Heading level={2} size="md">
              No orders yet
            </Heading>
          </div>
        )}

        <MarketplaceMyReviews />
      </Container>
    </ContentLayout>
  );
}

function getOrderTabCounts(
  orders: { order: MarketplaceOrder }[],
  currentUserPubky: string | null,
): Record<OrdersTab, number> {
  return {
    to_ship: orders.filter(({ order }) => isOrderInTab(order, 'to_ship', currentUserPubky)).length,
    in_transit: orders.filter(({ order }) => isOrderInTab(order, 'in_transit', currentUserPubky)).length,
    completed: orders.filter(({ order }) => isOrderInTab(order, 'completed', currentUserPubky)).length,
    all: orders.length,
  };
}

function isOrderInTab(order: MarketplaceOrder, tab: OrdersTab, currentUserPubky: string | null): boolean {
  switch (tab) {
    case 'to_ship':
      return isCurrentUserSeller(order, currentUserPubky) && order.state === 'paid';
    case 'in_transit':
      return ['shipped', 'delivered'].includes(order.state);
    case 'completed':
      return ['completed', 'refunded_external', 'cancelled'].includes(order.state);
    case 'all':
      return true;
  }
}

function isCurrentUserSeller(order: MarketplaceOrder, currentUserPubky: string | null): boolean {
  return currentUserPubky !== null && order.sellerPubky === currentUserPubky;
}
