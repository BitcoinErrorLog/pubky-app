'use client';

import { ArrowLeft, Scale, ShieldAlert } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { isDurableCommerceMode } from '@/config/commerce';
import { useMarketplaceDisputes } from '@/hooks/useMarketplaceDisputes/useMarketplaceDisputes';
import { useMarketplaceModeration } from '@/hooks/useMarketplaceModeration/useMarketplaceModeration';
import { formatCommerceMoney } from '@/libs/commerce/format';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceDisputeCaseDialog } from '@/organisms/Marketplace/MarketplaceDisputeCaseDialog';

export function MarketplaceModeration() {
  const moderation = useMarketplaceModeration();
  const disputes = useMarketplaceDisputes();

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28"
      classNameWrapperContent="max-w-4xl"
    >
      <Container overrideDefaults className="flex w-full flex-col gap-6 px-4 sm:px-6">
        <Link href={APP_ROUTES.MARKETPLACE} overrideDefaults className="inline-flex w-fit items-center gap-2 text-sm">
          <ArrowLeft className="size-4" />
          Marketplace
        </Link>
        <div>
          <Heading level={1} size="xl" className="text-4xl sm:text-6xl">
            Moderation queue
          </Heading>
          <Typography as="p" className="mt-2 text-muted-foreground">
            Structured reports are role-scoped and append-only.
          </Typography>
        </div>

        {moderation.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : moderation.error ? (
          <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
            {moderation.error}
          </div>
        ) : moderation.reports.length ? (
          <div className="grid gap-3">
            {moderation.reports.map((report) => (
              <Card key={report.id} className="border py-4">
                <CardContent className="grid gap-2 px-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge>{report.reason.replaceAll('_', ' ')}</Badge>
                    <Badge variant="secondary">{report.targetType}</Badge>
                  </div>
                  <Typography as="p" className="font-semibold">
                    {report.targetId}
                  </Typography>
                  <Typography as="p" className="text-sm text-muted-foreground">
                    {report.details}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed">
            <ShieldAlert className="mb-3 size-10 text-muted-foreground" />
            <Heading level={2} size="md">
              Queue clear
            </Heading>
          </div>
        )}

        {/* Dispute adjudication is a durable-service surface. Outside
            transaction-service mode there is no queue and no evidence store,
            so the section says that instead of rendering something simulated.
            Inside it, the queue exists ONLY for configured moderators: the
            service refuses everyone else with 403, and this template renders
            nothing at all in that case — an empty-looking queue would fake a
            role the account does not hold. */}
        {!isDurableCommerceMode(disputes.adapterMode) ? (
          <div className="grid gap-3">
            <Heading level={2} size="lg">
              Dispute adjudication
            </Heading>
            <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
              <Scale className="mb-3 size-10 text-muted-foreground" />
              <Typography as="p" className="max-w-lg text-sm text-muted-foreground">
                Dispute adjudication requires the durable transaction service. This deployment does not run it — the
                sandbox has no dispute queue and no evidence records — so there is nothing real to show here.
              </Typography>
            </div>
          </div>
        ) : disputes.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : disputes.error ? (
          <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
            {disputes.error}
          </div>
        ) : disputes.isModerator ? (
          <div className="grid gap-3">
            <div>
              <Heading level={2} size="lg">
                Dispute adjudication
              </Heading>
              <Typography as="p" className="mt-1 text-sm text-muted-foreground">
                Every order under, or previously under, dispute. Opening a case file is a recorded action: the service
                audits each moderator evidence read in the same transaction that serves it.
              </Typography>
            </div>
            {disputes.disputes.length ? (
              <div className="grid gap-3">
                {disputes.disputes.map((order) => (
                  <Card key={order.id} className="border py-4">
                    <CardContent className="grid gap-3 px-4 lg:grid-cols-[1fr_auto] lg:items-center">
                      <div className="grid gap-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge>{order.dispute?.state === 'open' ? 'open' : 'resolved'}</Badge>
                          <Badge variant="secondary">{order.state.replaceAll('_', ' ')}</Badge>
                          {order.dispute?.requestedRemedy && (
                            <Badge variant="outline">wants {order.dispute.requestedRemedy.replaceAll('_', ' ')}</Badge>
                          )}
                        </div>
                        <Typography as="p" className="font-semibold">
                          {order.dispute?.reason}
                        </Typography>
                        <Typography as="p" className="text-xs text-muted-foreground">
                          Order {order.id.slice(0, 8)}… · {formatCommerceMoney(order.total)} · buyer{' '}
                          {order.buyerPubky.slice(0, 8)}… · seller {order.sellerPubky.slice(0, 8)}… ·{' '}
                          {order.dispute?.evidenceCount ?? 0} evidence item(s)
                          {order.dispute?.openedAt
                            ? ` · opened ${new Date(order.dispute.openedAt).toLocaleString('en-US')}`
                            : ''}
                        </Typography>
                      </div>
                      <MarketplaceDisputeCaseDialog orderId={order.id} canResolve onChanged={disputes.refresh} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed">
                <Scale className="mb-3 size-10 text-muted-foreground" />
                <Heading level={3} size="md">
                  No disputes to adjudicate
                </Heading>
              </div>
            )}
          </div>
        ) : null}
      </Container>
    </ContentLayout>
  );
}
