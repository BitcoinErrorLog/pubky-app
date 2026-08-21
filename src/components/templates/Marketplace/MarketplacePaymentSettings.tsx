'use client';

import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  SlidersHorizontal,
  Store,
  WalletCards,
} from 'lucide-react';
import { APP_ROUTES, MARKETPLACE_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Label } from '@/atoms/Label/Label';
import { Link } from '@/atoms/Link/Link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Switch } from '@/atoms/Switch/Switch';
import { Typography } from '@/atoms/Typography/Typography';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceLocksConnect } from '@/hooks/useMarketplaceLocksConnect/useMarketplaceLocksConnect';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { useMarketplaceDisplayStore } from '@/stores/marketplace-display/marketplace-display.store';

export function MarketplacePaymentSettings() {
  const locksConnect = useMarketplaceLocksConnect();
  const showFxEstimate = useMarketplaceDisplayStore((state) => state.showFxEstimate);
  const setShowFxEstimate = useMarketplaceDisplayStore((state) => state.setShowFxEstimate);
  const measurementSystem = useMarketplaceDisplayStore((state) => state.measurementSystem);
  const setMeasurementSystem = useMarketplaceDisplayStore((state) => state.setMeasurementSystem);

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

        <Card className="border">
          <CardContent className="flex flex-col gap-3 px-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Store className="mt-1 size-5 text-brand" />
              <div>
                <Typography as="h2" className="font-semibold">
                  Looking for your shop name and policies?
                </Typography>
                <Typography as="p" className="text-sm text-muted-foreground">
                  Storefront settings live under My shop, next to your listings.
                </Typography>
              </div>
            </div>
            <Button asChild variant="secondary" className="shrink-0 rounded-full">
              <Link href={MARKETPLACE_ROUTES.MY_SHOP} overrideDefaults>
                Open My shop
              </Link>
            </Button>
          </CardContent>
        </Card>

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

        <Card className="border">
          <CardContent className="grid gap-5 px-6">
            <div className="flex gap-3">
              <SlidersHorizontal className="mt-1 size-5 text-brand" />
              <div>
                <Typography as="h2" className="font-semibold">
                  Display preferences
                </Typography>
                <Typography as="p" className="text-sm text-muted-foreground">
                  How prices and package details render for you, stored on this device. Neither setting changes any
                  listing record or payment amount.
                </Typography>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="marketplace-fx-estimate" className="font-medium">
                  Approximate price conversions
                </Label>
                <Typography as="p" className="text-sm text-muted-foreground">
                  Show &ldquo;≈&rdquo; estimates beside prices (fiat ↔ bitcoin) at the current exchange rate. Indicative
                  only — payments always settle in the listing&rsquo;s own pricing asset.
                </Typography>
              </div>
              <Switch
                id="marketplace-fx-estimate"
                checked={showFxEstimate}
                onCheckedChange={setShowFxEstimate}
                aria-label="Show approximate price conversions"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="marketplace-measurement-system" className="font-medium">
                  Measurement system
                </Label>
                <Typography as="p" className="text-sm text-muted-foreground">
                  Units for package dimensions and weight. Records always store exact millimeters and grams.
                </Typography>
              </div>
              <Select
                value={measurementSystem ?? 'auto'}
                onValueChange={(value) =>
                  setMeasurementSystem(value === 'auto' ? null : (value as 'metric' | 'imperial'))
                }
              >
                <SelectTrigger
                  id="marketplace-measurement-system"
                  className="h-11 w-56 shrink-0 rounded-md border px-3"
                  aria-label="Measurement system"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatic (from locale)</SelectItem>
                  <SelectItem value="metric">Metric (cm, g)</SelectItem>
                  <SelectItem value="imperial">Imperial (in, oz)</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
