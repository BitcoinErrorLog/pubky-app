'use client';

import { ArrowLeft, Bell, Gavel, HandCoins, MessageCircle } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Switch } from '@/atoms/Switch/Switch';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceNotifications } from '@/hooks/useMarketplaceNotifications/useMarketplaceNotifications';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import type { MarketplaceNotification } from '@/services/marketplace/marketplace';

export function MarketplaceNotifications() {
  const { notifications, preferences, unreadCount, isLoading, error, canMarkRead, markAllRead, updatePreferences } =
    useMarketplaceNotifications();

  const setPreference = (key: 'messages' | 'offers' | 'bids' | 'auctions', checked: boolean) => {
    if (!preferences) return;
    void updatePreferences({
      messages: preferences.messages,
      offers: preferences.offers,
      bids: preferences.bids,
      auctions: preferences.auctions,
      [key]: checked,
    });
  };

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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Heading level={1} size="xl" className="text-4xl sm:text-6xl">
              Commerce activity
            </Heading>
            <Typography as="p" className="mt-2 text-muted-foreground">
              {unreadCount} unread transaction {unreadCount === 1 ? 'update' : 'updates'}.
            </Typography>
          </div>
          {canMarkRead ? (
            <Button variant="secondary" className="rounded-full" disabled={unreadCount === 0} onClick={markAllRead}>
              Mark all read
            </Button>
          ) : (
            <Typography as="p" className="max-w-64 text-right text-xs text-muted-foreground">
              The durable marketplace service delivers notifications but does not store read state or preferences yet,
              so they cannot be marked read or filtered here.
            </Typography>
          )}
        </div>

        {preferences && (
          <Card className="border py-4">
            <CardContent className="grid gap-4 px-5 sm:grid-cols-2">
              {(
                [
                  ['messages', 'Messages'],
                  ['offers', 'Offers'],
                  ['bids', 'Bid updates'],
                  ['auctions', 'Auction results'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-4 text-sm">
                  {label}
                  <Switch
                    checked={preferences[key]}
                    onCheckedChange={(checked) => setPreference(key, checked)}
                    aria-label={`${label} notifications`}
                  />
                </label>
              ))}
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : error ? (
          <div role="alert" className="rounded-xl border border-destructive/40 p-4">
            {error}
          </div>
        ) : notifications.length ? (
          <div className="flex flex-col gap-3">
            {notifications.map((notification) => (
              <Card key={notification.id} className="border py-4">
                <CardContent className="flex items-center gap-4 px-4">
                  <div className="rounded-full bg-brand/15 p-3 text-brand">
                    <NotificationIcon type={notification.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Typography as="p" className="font-semibold">
                      {notificationLabel(notification.type)}
                    </Typography>
                    <Typography as="p" className="truncate text-sm text-muted-foreground">
                      From {notification.actorPubky.slice(0, 10)}…
                    </Typography>
                  </div>
                  <time dateTime={notification.createdAt} className="text-xs text-muted-foreground">
                    {new Date(notification.createdAt).toLocaleDateString('en-US')}
                  </time>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center">
            <Bell className="mb-3 size-10 text-muted-foreground" />
            <Heading level={2} size="md">
              No commerce updates
            </Heading>
          </div>
        )}
      </Container>
    </ContentLayout>
  );
}

function NotificationIcon({ type }: { type: MarketplaceNotification['type'] }) {
  switch (type) {
    case 'message_received':
      return <MessageCircle className="size-5" />;
    case 'outbid':
    case 'auction_won':
    case 'auction_ended':
      return <Gavel className="size-5" />;
    default:
      return <HandCoins className="size-5" />;
  }
}

function notificationLabel(type: MarketplaceNotification['type']): string {
  switch (type) {
    case 'message_received':
      return 'New marketplace message';
    case 'offer_received':
      return 'New offer received';
    case 'offer_countered':
      return 'Offer countered';
    case 'offer_accepted':
      return 'Offer accepted';
    case 'offer_rejected':
      return 'Offer declined';
    case 'outbid':
      return 'You were outbid';
    case 'auction_won':
      return 'You won the auction';
    case 'auction_ended':
      return 'Auction ended';
    case 'order_created':
      return 'New order created';
    case 'payment_confirmed':
      return 'Payment confirmed';
    case 'order_cancelled':
      return 'Order cancelled';
    case 'order_shipped':
      return 'Order shipped';
    case 'order_delivered':
      return 'Delivery confirmed';
    case 'return_updated':
      return 'Return updated';
    case 'refund_recorded':
      return 'External refund recorded';
    case 'dispute_updated':
      return 'Dispute updated';
    case 'review_received':
      return 'New review received';
  }
}
