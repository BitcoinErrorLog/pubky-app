'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { Controller } from 'react-hook-form';
import { APP_ROUTES, MARKETPLACE_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Checkbox } from '@/atoms/Checkbox/Checkbox';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Label } from '@/atoms/Label/Label';
import { Link } from '@/atoms/Link/Link';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { getCommerceAdapterMode, isLocksPaykitCommerceMode } from '@/config/commerce';
import { useMarketplaceCart } from '@/hooks/useMarketplaceCart/useMarketplaceCart';
import { useMarketplaceCheckout } from '@/hooks/useMarketplaceCheckout/useMarketplaceCheckout';
import { formatCommerceMoney } from '@/libs/commerce/format';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';

export function MarketplaceCart() {
  const router = useRouter();
  const cart = useMarketplaceCart();
  const checkout = useMarketplaceCheckout(cart.items, cart.clear);
  const adapterMode = getCommerceAdapterMode();
  const isSandbox = adapterMode === 'sandbox';

  const submit = async () => {
    if (await checkout.submit()) router.push(MARKETPLACE_ROUTES.ORDERS);
  };

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28"
      classNameWrapperContent="max-w-6xl"
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
            Cart
          </Heading>
          <Typography as="p" className="mt-2 text-muted-foreground">
            {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'} · local-first until checkout.
          </Typography>
        </div>

        {cart.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : cart.items.length ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
            <div className="flex flex-col gap-3">
              {cart.items.map((item) => {
                const variant = item.listing.record.variants.find(({ id }) => id === item.variantId);
                const price =
                  variant?.priceOverride ??
                  (item.listing.record.sale.format === 'fixed_price' ? item.listing.record.sale.unitPrice : null);
                return (
                  <Card key={item.id} className="border py-4">
                    <CardContent className="flex items-center gap-4 px-4">
                      <div className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-brand/15">
                        <ShoppingCart className="size-7 text-brand" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Typography as="h2" className="truncate font-semibold">
                          {item.listing.record.title}
                        </Typography>
                        <Typography as="p" className="text-sm text-muted-foreground">
                          {variant ? Object.values(variant.options).join(' · ') || 'Default' : 'Default'}
                        </Typography>
                        {price && (
                          <Typography as="p" className="mt-1 font-bold text-brand">
                            {formatCommerceMoney(price)}
                          </Typography>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Decrease ${item.listing.record.title} quantity`}
                          disabled={item.quantity <= 1}
                          onClick={() => void cart.update(item.listingId, item.variantId, item.quantity - 1)}
                        >
                          <Minus className="size-4" />
                        </Button>
                        <Typography as="span" className="min-w-8 text-center">
                          {item.quantity}
                        </Typography>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Increase ${item.listing.record.title} quantity`}
                          disabled={!variant || item.quantity >= variant.quantity}
                          onClick={() => void cart.update(item.listingId, item.variantId, item.quantity + 1)}
                        >
                          <Plus className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${item.listing.record.title}`}
                          onClick={() => void cart.remove(item.listingId, item.variantId)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="h-fit border">
              <CardContent className="grid gap-4 px-6">
                <Typography as="h2" className="text-xl font-semibold">
                  Delivery and guarantee
                </Typography>
                <ControlledInputField name="name" control={checkout.form.control} label="Recipient" />
                <ControlledInputField name="line1" control={checkout.form.control} label="Address line 1" />
                <ControlledInputField name="line2" control={checkout.form.control} label="Address line 2" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <ControlledInputField name="city" control={checkout.form.control} label="City" />
                  <ControlledInputField name="region" control={checkout.form.control} label="Region" />
                  <ControlledInputField name="postalCode" control={checkout.form.control} label="Postal code" />
                  <ControlledInputField name="countryCode" control={checkout.form.control} label="Country" />
                </div>
                <Controller
                  name="acceptsGuarantee"
                  control={checkout.form.control}
                  render={({ field }) => (
                    <Label className="items-start gap-3">
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      <span>
                        {/* The guarantee copy must stay truthful per mode: only
                            locks-paykit has live payment rails, and even there the
                            marketplace never holds or moves funds itself. */}
                        {isSandbox
                          ? 'I accept sandbox guarantee policy v1. This is not legal escrow and moves no real funds.'
                          : isLocksPaykitCommerceMode(adapterMode)
                            ? 'I accept guarantee policy v1. This is not legal escrow — payment goes from your wallet directly to the seller, and this marketplace never holds funds.'
                            : 'I accept guarantee policy v1. This is not legal escrow, and no payment rails are live in this deployment — no real funds move.'}
                      </span>
                    </Label>
                  )}
                />
                <div className="border-t pt-4">
                  <div className="flex justify-between">
                    <Typography as="span">Items</Typography>
                    <Typography as="span" className="font-bold">
                      {formatCommerceMoney({ amountMinor: cart.subtotalMinor, currency: 'USD', exponent: 2 })}
                    </Typography>
                  </div>
                  <Typography as="p" className="mt-2 text-xs text-muted-foreground">
                    {isSandbox
                      ? 'Shipping and sandbox tax are calculated authoritatively at checkout.'
                      : 'Shipping and tax are calculated authoritatively by the transaction service at checkout.'}
                  </Typography>
                </div>
                <Button className="w-full rounded-full" onClick={submit}>
                  {isSandbox ? 'Place sandbox order' : 'Place order'}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center">
            <ShoppingCart className="mb-3 size-10 text-muted-foreground" />
            <Heading level={2} size="md">
              Your cart is empty
            </Heading>
          </div>
        )}
      </Container>
    </ContentLayout>
  );
}
