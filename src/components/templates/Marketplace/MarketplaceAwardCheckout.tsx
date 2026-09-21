'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { APP_ROUTES, getMarketplaceListingRoute, MARKETPLACE_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Typography } from '@/atoms/Typography/Typography';
import { isMarketplaceAwardCheckoutEligible } from '@/core/services/marketplace/marketplace-projections';
import { useMarketplaceAddressBook } from '@/hooks/useMarketplaceAddressBook/useMarketplaceAddressBook';
import { useMarketplaceCart } from '@/hooks/useMarketplaceCart/useMarketplaceCart';
import { useMarketplaceOfferCheckout } from '@/hooks/useMarketplaceOfferCheckout/useMarketplaceOfferCheckout';
import { useMarketplaceOffers } from '@/hooks/useMarketplaceOffers/useMarketplaceOffers';
import { marketplaceOfferCheckoutFailureMessage } from '@/libs/commerce/failure-messages';
import { formatCommerceMoney } from '@/libs/commerce/format';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceSectionNav } from '@/organisms/Marketplace/MarketplaceSectionNav';
import { MarketplaceSessionRequiredCard } from '@/organisms/Marketplace/MarketplaceSessionRequiredCard';
import { useAuthStore } from '@/stores/auth/auth.store';

export function MarketplaceAwardCheckout() {
  const searchParams = useSearchParams();
  const offerReference = searchParams.get('offer');
  const offers = useMarketplaceOffers();
  const cart = useMarketplaceCart();
  const addressBook = useMarketplaceAddressBook();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<
    'expired' | 'converted' | 'error' | 'success' | 'unavailable' | 'session' | null
  >(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const offer = offers.offers.find((item) => item.id === offerReference || item.award?.id === offerReference);
  const award = offer?.award;
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const addresses = addressBook.addresses;
  const selectedAddress = addresses.find((item) => item.id === addressId) ?? addresses[0];

  const removeAwardLine = async () => {
    const line = cart.awardItems.find((item) => item.awardId === award?.id);
    if (line) await cart.remove(line.listingId, line.variantId, line.awardId ?? undefined);
  };

  const submit = async () => {
    if (!offer || !award || !selectedAddress) return;
    const result = await checkout.submit(offer, {
      name: selectedAddress.name,
      line1: selectedAddress.line1,
      line2: selectedAddress.line2,
      city: selectedAddress.city,
      region: selectedAddress.region,
      postalCode: selectedAddress.postal_code,
      countryCode: selectedAddress.country_code,
    });
    if (result.ok) {
      await removeAwardLine();
      await offers.refresh();
      setOrderId(result.orderId);
      setOutcome('success');
      return;
    }
    if (result.code === 'AWARD_UNAVAILABLE') {
      await removeAwardLine();
      await offers.refresh();
      setOutcome('unavailable');
    } else if (result.code === 'SESSION_REQUIRED') {
      setOutcome('session');
    } else if (result.code === 'AWARD_EXPIRED') {
      await removeAwardLine();
      await offers.refresh();
      setOutcome('expired');
    } else if (result.code === 'AWARD_ALREADY_CONVERTED' || result.code === 'REVISION_CONFLICT') {
      await removeAwardLine();
      await offers.refresh();
      setOutcome('converted');
    } else {
      setErrorCode(result.code);
      setOutcome('error');
    }
  };

  const checkout = useMarketplaceOfferCheckout();
  const unavailable =
    !offer ||
    !award ||
    award.state !== 'active' ||
    offer.buyerPubky !== currentUserPubky ||
    !isMarketplaceAwardCheckoutEligible(award);
  const listingRoute = award && getMarketplaceListingRoute(award.listing.sellerPubky, award.listing.listingId);

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28"
      classNameWrapperContent="max-w-3xl"
    >
      <Container
        overrideDefaults
        className="flex w-full flex-col gap-6 px-4 sm:px-6"
        data-surface="marketplace-award-checkout"
      >
        <MarketplaceSectionNav />
        <Link href={MARKETPLACE_ROUTES.CART} overrideDefaults className="text-sm text-muted-foreground">
          Back to cart
        </Link>
        {outcome === 'success' ? (
          <Card className="border">
            <CardContent className="grid gap-4 px-6">
              <Heading level={1} size="lg">
                Order created
              </Heading>
              <Typography as="p">
                Your agreed merchandise total is {award ? formatCommerceMoney(award.merchandiseTotal) : ''}.
              </Typography>
              <Button asChild className="w-fit rounded-full">
                <Link href={`${MARKETPLACE_ROUTES.ORDERS}${orderId ? `#${orderId}` : ''}`} overrideDefaults>
                  View order
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : outcome === 'expired' ? (
          <Card className="border">
            <CardContent className="grid gap-4 px-6">
              <Heading level={1} size="lg">
                Offer expired
              </Heading>
              <Typography as="p">
                This accepted offer expired before the order was placed. Nothing was ordered.
              </Typography>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="secondary" className="rounded-full">
                  <Link href={MARKETPLACE_ROUTES.OFFERS} overrideDefaults>
                    View offers
                  </Link>
                </Button>
                {listingRoute && (
                  <Button asChild className="rounded-full">
                    <Link href={listingRoute} overrideDefaults>
                      Buy at current price
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : outcome === 'converted' ? (
          <Card className="border">
            <CardContent className="grid gap-4 px-6">
              <Heading level={1} size="lg">
                Offer already converted
              </Heading>
              <Typography as="p">This accepted offer has already been converted to an order.</Typography>
              <Button asChild className="w-fit rounded-full">
                <Link href={MARKETPLACE_ROUTES.ORDERS} overrideDefaults>
                  View orders
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : outcome === 'unavailable' ? (
          <Card className="border">
            <CardContent className="grid gap-3 px-6">
              <Heading level={1} size="lg">
                Checkout unavailable
              </Heading>
              <Typography as="p">This offer is no longer available.</Typography>
              <Link href={MARKETPLACE_ROUTES.OFFERS} overrideDefaults>
                View offers
              </Link>
            </CardContent>
          </Card>
        ) : outcome === 'session' ? (
          <MarketplaceSessionRequiredCard />
        ) : outcome === 'error' ? (
          <Card className="border">
            <CardContent className="grid gap-4 px-6">
              <Heading level={1} size="lg">
                Checkout could not be completed
              </Heading>
              <Typography as="p">{marketplaceOfferCheckoutFailureMessage(errorCode)}</Typography>
              <Button className="w-fit rounded-full" onClick={() => setOutcome(null)}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : unavailable ? (
          <Card className="border">
            <CardContent className="grid gap-3 px-6">
              <Heading level={1} size="lg">
                Checkout unavailable
              </Heading>
              <Typography as="p">Checkout for this offer is unavailable right now.</Typography>
              <Link href={APP_ROUTES.MARKETPLACE} overrideDefaults>
                Browse the marketplace
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card className="border">
            <CardContent className="grid gap-6 px-6">
              <div>
                <Heading level={1} size="lg">
                  Place order
                </Heading>
                <Typography as="p" className="mt-2 text-muted-foreground">
                  Checkout window closes {new Date(award.convertBy).toLocaleString('en-US')}
                </Typography>
              </div>
              <div className="grid gap-2 rounded-xl border p-4">
                <Typography as="p" className="font-semibold">
                  {award.listing.title}
                </Typography>
                <Typography as="p" className="text-sm text-muted-foreground">
                  {award.variant.options.map((item) => item.value).join(' · ') || 'Default'} · Quantity {award.quantity}
                </Typography>
                <Typography as="p">
                  Subtotal <span className="font-bold">{formatCommerceMoney(award.subtotal)}</span>
                </Typography>
                <Typography as="p">
                  Shipping <span className="font-bold">{formatCommerceMoney(award.shipping)}</span>
                </Typography>
                <Typography as="p" className="border-t pt-2 font-semibold">
                  Merchandise total <span className="text-brand">{formatCommerceMoney(award.merchandiseTotal)}</span>
                </Typography>
              </div>
              {addressBook.isLoading ? (
                <Typography as="p" role="status">
                  Loading delivery addresses…
                </Typography>
              ) : addresses.length ? (
                <>
                  <div className="grid gap-2">
                    <Typography as="p" className="font-medium">
                      Delivery address
                    </Typography>
                    <Select value={selectedAddress?.id} onValueChange={setAddressId}>
                      <SelectTrigger className="h-11 w-full rounded-md border px-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {addresses.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label} · {item.city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full rounded-full"
                    disabled={checkout.isSubmitting}
                    onClick={() => void submit()}
                  >
                    {checkout.isSubmitting ? 'Submitting…' : 'Place order'}
                  </Button>
                </>
              ) : (
                <div className="grid gap-3">
                  <Typography as="p" role="alert">
                    Save a{' '}
                    <Link
                      href={MARKETPLACE_ROUTES.SETTINGS_ADDRESSES}
                      overrideDefaults
                      className="text-brand hover:underline"
                    >
                      delivery address
                    </Link>{' '}
                    before checkout.
                  </Typography>
                  <Button asChild className="w-fit rounded-full">
                    <Link href={MARKETPLACE_ROUTES.SETTINGS_ADDRESSES} overrideDefaults>
                      Add delivery address
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </Container>
    </ContentLayout>
  );
}
