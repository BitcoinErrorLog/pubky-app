'use client';

import { ArrowLeft, ExternalLink, ReceiptText } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
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
import { MarketplaceDisputeCaseDialog } from '@/organisms/Marketplace/MarketplaceDisputeCaseDialog';
import { MarketplaceOrderActions } from '@/organisms/Marketplace/MarketplaceOrderActions';
import { MarketplacePaymentStatusCard } from '@/organisms/Marketplace/MarketplacePaymentStatusCard';
import { MarketplaceSessionRequiredCard } from '@/organisms/Marketplace/MarketplaceSessionRequiredCard';
import { useAuthStore } from '@/stores/auth/auth.store';

export function MarketplaceOrders() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { orders, isLoading, error, needsSession, refresh, advancePayment, actOnOrder, adapterMode } =
    useMarketplaceOrders();
  const isSandbox = adapterMode === 'sandbox';
  const hasTransactionBackend = isTransactionalCommerceMode(adapterMode);

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
          <MarketplaceSessionRequiredCard message={error} />
        ) : error ? (
          <div role="alert" className="rounded-xl border border-destructive/40 p-4">
            {error}
          </div>
        ) : orders.length ? (
          <div className="grid gap-4">
            {orders.map(({ order, payment, receipt }) => {
              const isBuyer = currentUserPubky === order.buyerPubky;
              return (
                <Card key={order.id} className="border py-5">
                  <CardContent className="grid gap-5 px-5 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        <Badge>{isBuyer ? 'Purchase' : 'Sale'}</Badge>
                        <Badge variant="secondary">{order.state.replaceAll('_', ' ')}</Badge>
                      </div>
                      {order.lines.map((line) => (
                        <Typography key={line.listingAggregateId} as="p" className="font-semibold">
                          {line.title} × {line.quantity}
                        </Typography>
                      ))}
                      <Typography as="p" className="mt-2 text-2xl font-bold text-brand">
                        {formatCommerceMoney(order.total)}
                      </Typography>
                      <Typography as="p" className="mt-1 text-xs text-muted-foreground">
                        Items {formatCommerceMoney(order.subtotal)} · Shipping {formatCommerceMoney(order.shipping)} ·
                        Tax {formatCommerceMoney(order.tax)}
                      </Typography>
                      {receipt && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                          <ReceiptText className="size-4 text-brand" />
                          Receipt integrity {receipt.contentHash.slice(0, 12)}…
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
                      {order.dispute && (
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <Typography as="p" className="text-sm text-muted-foreground">
                            Dispute {order.dispute.state}: {order.dispute.reason}
                            {order.dispute.resolution
                              ? ` · resolved as ${order.dispute.resolution.replaceAll('_', ' ')}`
                              : ''}
                            {/* The count comes from the projection; the bodies do not.
                                Evidence bodies are readable ONLY through the scoped
                                case-file read (ADR-0019 §8), served to the two dispute
                                participants and configured moderators — the dialog below
                                is that read. The sandbox has no evidence store, so the
                                case file only exists against the durable service. */}
                            {order.dispute.evidenceCount ? ` · ${order.dispute.evidenceCount} evidence item(s)` : ''}
                          </Typography>
                          {!isSandbox && (
                            <MarketplaceDisputeCaseDialog orderId={order.id} canResolve={false} onChanged={refresh} />
                          )}
                        </div>
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
                      canCancel={isSandbox}
                      canEditReview={adapterMode === 'transaction-service'}
                      actOnOrder={actOnOrder}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center">
            <ReceiptText className="mb-3 size-10 text-muted-foreground" />
            <Heading level={2} size="md">
              No orders yet
            </Heading>
          </div>
        )}
      </Container>
    </ContentLayout>
  );
}
