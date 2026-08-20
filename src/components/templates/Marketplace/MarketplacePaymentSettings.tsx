'use client';

import { ArrowLeft, ExternalLink, KeyRound, WalletCards } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { getLocksUrl } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceShopSettingsForm } from '@/organisms/Marketplace/MarketplaceShopSettingsForm';

export function MarketplacePaymentSettings() {
  const openLocks = () => {
    const url = new URL('/connect', getLocksUrl());
    url.searchParams.set('return_to', window.location.href);
    url.searchParams.set('state', crypto.randomUUID().replaceAll('-', ''));
    window.open(url, '_blank', 'noopener,noreferrer');
  };

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
              </div>
            </div>
            <Button variant="secondary" className="rounded-full" onClick={openLocks}>
              Open Locks connect
              <ExternalLink className="ml-2 size-4" />
            </Button>
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
                  wallet.
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
