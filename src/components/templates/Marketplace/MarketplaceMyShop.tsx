'use client';

import { ArrowLeft, ExternalLink, LayoutDashboard } from 'lucide-react';
import { getMarketplaceShopRoute, MARKETPLACE_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceShopSettingsForm } from '@/organisms/Marketplace/MarketplaceShopSettingsForm';
import { useAuthStore } from '@/stores/auth/auth.store';

export function MarketplaceMyShop() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);

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
          href={MARKETPLACE_ROUTES.DASHBOARD}
          overrideDefaults
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Seller dashboard
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Badge className="mb-4">Seller studio</Badge>
            <Heading level={1} size="xl" className="text-4xl sm:text-6xl">
              My shop
            </Heading>
            <Typography as="p" className="mt-2 max-w-xl text-muted-foreground">
              Your public storefront: the name, bio, and policies buyers see on your shop page and from every listing
              you publish.
            </Typography>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentUserPubky && (
              <Button asChild variant="secondary" className="rounded-full">
                <Link href={getMarketplaceShopRoute(currentUserPubky)} overrideDefaults>
                  View public shop page
                  <ExternalLink className="ml-2 size-4" />
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" className="rounded-full">
              <Link href={MARKETPLACE_ROUTES.DASHBOARD} overrideDefaults>
                <LayoutDashboard className="mr-2 size-4" />
                Dashboard
              </Link>
            </Button>
          </div>
        </div>

        <MarketplaceShopSettingsForm />
      </Container>
    </ContentLayout>
  );
}
