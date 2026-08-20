'use client';

import { ArrowLeft, CheckCircle2, ExternalLink, KeyRound, LoaderCircle, WalletCards } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceLocksConnect } from '@/hooks/useMarketplaceLocksConnect/useMarketplaceLocksConnect';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceShopSettingsForm } from '@/organisms/Marketplace/MarketplaceShopSettingsForm';

export function MarketplacePaymentSettings() {
  const locksConnect = useMarketplaceLocksConnect();

  const openPaykit = () => {
    const url = CommerceController.getPaykitSetupUrl(window.location.href, crypto.randomUUID().replaceAll('-', ''));
    window.open(url, '_blank', 'noopener,noreferrer');
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
        <div>
          <Badge className="mb-4">Pre-production integration</Badge>
          <Heading level={1} size="xl" className="text-4xl sm:text-6xl">
            Payments and Locks
          </Heading>
          <Typography as="p" className="mt-2 text-muted-foreground">
            Connect creator authority with Pubky Ring, then approve a watch-only Paykit account through Bitkit.
          </Typography>
        </div>

        <MarketplaceShopSettingsForm />

        <Card className="border">
          <CardContent className="grid gap-4 px-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex gap-3">
              <KeyRound className="mt-1 size-5 text-brand" />
              <div>
                <Typography as="h2" className="font-semibold">
                  1. Authorize the Lock Server
                </Typography>
                <Typography as="p" className="text-sm text-muted-foreground">
                  Pubky Ring displays the exact creator capability grant. No identity secret enters Pubky App.
                </Typography>
                {locksConnect.connectedCreator && (
                  <Typography as="p" className="mt-2 flex items-center gap-2 text-sm text-brand">
                    <CheckCircle2 className="size-4" />
                    Creator authority connected: {locksConnect.connectedCreator.slice(0, 12)}…
                  </Typography>
                )}
                {locksConnect.error && (
                  <Typography as="p" role="alert" className="mt-2 text-sm text-amber-300">
                    {locksConnect.error}
                  </Typography>
                )}
              </div>
            </div>
            {locksConnect.connectedCreator ? (
              <Badge variant="secondary" className="justify-self-start sm:justify-self-auto">
                Connected
              </Badge>
            ) : (
              <Button
                variant="secondary"
                className="rounded-full"
                disabled={locksConnect.isExchanging}
                onClick={locksConnect.openConnect}
              >
                {locksConnect.isExchanging ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
                Open Locks connect
                <ExternalLink className="ml-2 size-4" />
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="border">
          <CardContent className="grid gap-4 px-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex gap-3">
              <WalletCards className="mt-1 size-5 text-brand" />
              <div>
                <Typography as="h2" className="font-semibold">
                  2. Approve Paykit in Bitkit
                </Typography>
                <Typography as="p" className="text-sm text-muted-foreground">
                  Bitkit sends a watch-only BIP84 account claim directly to Paykit Server. Spending keys remain in the
                  wallet. Completion is confirmed inside the setup window — this app has no API to verify Paykit setup
                  state and does not pretend to.
                </Typography>
              </div>
            </div>
            <Button className="rounded-full" onClick={openPaykit}>
              Open Bitkit setup
              <ExternalLink className="ml-2 size-4" />
            </Button>
          </CardContent>
        </Card>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Locks and Paykit Server are pre-production. Do not use this prototype to protect valuable content or real
          funds without an independent security and operational review.
        </div>
      </Container>
    </ContentLayout>
  );
}
