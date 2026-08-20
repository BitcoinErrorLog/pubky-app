'use client';

import { ArrowLeft, MessageCircle } from 'lucide-react';
import { APP_ROUTES, getMarketplaceListingRoute } from '@/app/routes';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceInbox } from '@/hooks/useMarketplaceInbox/useMarketplaceInbox';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { useAuthStore } from '@/stores/auth/auth.store';

export function MarketplaceInbox() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { conversations, isLoading, error } = useMarketplaceInbox();

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28"
      classNameWrapperContent="max-w-3xl"
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
            Messages
          </Heading>
          <Typography as="p" className="mt-2 text-muted-foreground">
            Private listing conversations and transaction context.
          </Typography>
        </div>

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : error ? (
          <div role="alert" className="rounded-xl border border-destructive/40 p-4">
            {error}
          </div>
        ) : conversations.length ? (
          <div className="flex flex-col gap-3">
            {conversations.map((conversation) => {
              const last = conversation.messages.at(-1);
              const counterpart =
                currentUserPubky === conversation.sellerPubky ? conversation.buyerPubky : conversation.sellerPubky;
              const listingRoute = listingRouteFromAggregate(conversation.listingAggregateId);
              return (
                <Link key={conversation.id} href={listingRoute} overrideDefaults>
                  <Card className="border py-4 transition-colors hover:border-brand/40">
                    <CardContent className="flex items-center gap-4 px-4">
                      <div className="rounded-full bg-brand/15 p-3 text-brand">
                        <MessageCircle className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Typography as="p" className="font-semibold">
                          {counterpart.slice(0, 10)}…
                        </Typography>
                        <Typography as="p" className="truncate text-sm text-muted-foreground">
                          {last?.text ?? 'Conversation started'}
                        </Typography>
                      </div>
                      <Typography as="time" className="text-xs text-muted-foreground">
                        {last ? new Date(last.createdAt).toLocaleDateString('en-US') : ''}
                      </Typography>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center">
            <MessageCircle className="mb-3 size-10 text-muted-foreground" />
            <Heading level={2} size="md">
              No messages yet
            </Heading>
            <Typography as="p" className="mt-2 text-muted-foreground">
              Open a listing and message its seller to begin.
            </Typography>
          </div>
        )}
      </Container>
    </ContentLayout>
  );
}

function listingRouteFromAggregate(aggregateId: string): string {
  const value = aggregateId.startsWith('listing:') ? aggregateId.slice('listing:'.length) : '';
  const sellerPubky = value.slice(0, 52);
  const listingId = value.slice(53);
  return sellerPubky && listingId ? getMarketplaceListingRoute(sellerPubky, listingId) : APP_ROUTES.MARKETPLACE;
}
