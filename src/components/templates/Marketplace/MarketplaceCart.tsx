'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { Controller } from 'react-hook-form';
import { APP_ROUTES, getMarketplaceListingRoute, MARKETPLACE_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Checkbox } from '@/atoms/Checkbox/Checkbox';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Image } from '@/atoms/Image/Image';
import { Label } from '@/atoms/Label/Label';
import { Link } from '@/atoms/Link/Link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { getCommerceAdapterMode, isLocksPaykitCommerceMode } from '@/config/commerce';
import { useMarketplaceCart } from '@/hooks/useMarketplaceCart/useMarketplaceCart';
import { useMarketplaceCheckout } from '@/hooks/useMarketplaceCheckout/useMarketplaceCheckout';
import { formatCommerceMoney } from '@/libs/commerce/format';
import { resolveFirstMarketplaceMediaUrl } from '@/libs/commerce/media-url';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceIndicativePrice } from '@/organisms/Marketplace/MarketplaceIndicativePrice';
import { MarketplaceSessionRequiredCard } from '@/organisms/Marketplace/MarketplaceSessionRequiredCard';

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
                // The record's media order is authoritative: the first image
                // is the cover here just as on cards and the detail gallery.
                const coverUrl = resolveFirstMarketplaceMediaUrl(
                  item.listing.record.media.filter(({ type }) => type === 'image').map(({ url }) => url),
                );
                const listingRoute = getMarketplaceListingRoute(
                  item.listing.record.ownerPubky,
                  item.listing.listing_id,
                );
                return (
                  <Card key={item.id} className="border py-4">
                    <CardContent className="flex items-center gap-4 px-4">
                      <Link href={listingRoute} overrideDefaults aria-label={`View ${item.listing.record.title}`}>
                        <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand/15">
                          <ShoppingCart className="size-7 text-brand" />
                          {coverUrl && (
                            <Image
                              src={coverUrl}
                              alt={item.listing.record.title}
                              fill
                              sizes="80px"
                              className="absolute inset-0 object-cover"
                            />
                          )}
                        </div>
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Typography as="h2" className="truncate font-semibold">
                          <Link href={listingRoute} overrideDefaults className="hover:text-brand hover:underline">
                            {item.listing.record.title}
                          </Link>
                        </Typography>
                        <Typography as="p" className="text-sm text-muted-foreground">
                          {variant ? Object.values(variant.options).join(' · ') || 'Default' : 'Default'}
                        </Typography>
                        {price && (
                          <Typography as="p" className="mt-1 font-bold text-brand">
                            {formatCommerceMoney(price)}{' '}
                            <MarketplaceIndicativePrice money={price} className="font-normal" />
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
                {checkout.addresses.length > 0 && (
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="checkout-address-picker">Saved addresses</Label>
                      <Link
                        href={MARKETPLACE_ROUTES.SETTINGS_ADDRESSES}
                        overrideDefaults
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        Manage
                      </Link>
                    </div>
                    <Select
                      value={checkout.selectedAddressId ?? 'new'}
                      onValueChange={(value) => checkout.selectAddress(value === 'new' ? null : value)}
                    >
                      <SelectTrigger id="checkout-address-picker" className="h-11 w-full rounded-md border px-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {checkout.addresses.map((address) => (
                          <SelectItem key={address.id} value={address.id}>
                            {address.label} · {address.city}
                            {address.is_default ? ' (default)' : ''}
                          </SelectItem>
                        ))}
                        <SelectItem value="new">New address</SelectItem>
                      </SelectContent>
                    </Select>
                    <Typography as="p" className="text-xs text-muted-foreground">
                      Saved on this device only — never published, and shared only with the transaction service when you
                      place the order.
                    </Typography>
                  </div>
                )}
                <ControlledInputField name="name" control={checkout.form.control} label="Recipient" />
                <ControlledInputField name="line1" control={checkout.form.control} label="Address line 1" />
                <ControlledInputField name="line2" control={checkout.form.control} label="Address line 2" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <ControlledInputField name="city" control={checkout.form.control} label="City" />
                  <ControlledInputField name="region" control={checkout.form.control} label="Region" />
                  <ControlledInputField name="postalCode" control={checkout.form.control} label="Postal code" />
                  <ControlledInputField name="countryCode" control={checkout.form.control} label="Country" />
                </div>
                {checkout.selectedAddressId === null && (
                  <div className="grid gap-3 rounded-xl border bg-card/60 p-3">
                    <Controller
                      name="saveAddress"
                      control={checkout.form.control}
                      render={({ field }) => (
                        <Label className="items-start gap-3">
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          <span>Save this address on this device for next time</span>
                        </Label>
                      )}
                    />
                    {checkout.form.watch('saveAddress') && (
                      <ControlledInputField
                        name="saveLabel"
                        control={checkout.form.control}
                        label="Label"
                        placeholder="Home"
                      />
                    )}
                  </div>
                )}
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
                    {/* One line per pricing asset: USD cents and satoshis are
                        never summed into one false number. */}
                    <div className="flex flex-col items-end">
                      {cart.subtotals.map((subtotal) => (
                        <Typography key={`${subtotal.currency}:${subtotal.exponent}`} as="span" className="font-bold">
                          {formatCommerceMoney(subtotal)}{' '}
                          <MarketplaceIndicativePrice money={subtotal} className="font-normal" />
                        </Typography>
                      ))}
                    </div>
                  </div>
                  <Typography as="p" className="mt-2 text-xs text-muted-foreground">
                    {isSandbox
                      ? 'Shipping and sandbox tax are calculated authoritatively at checkout.'
                      : 'Shipping and tax are calculated authoritatively by the transaction service at checkout.'}
                  </Typography>
                </div>
                {/* A checkout rejected for a missing/expired durable session is
                    recoverable in place: connect, then place the order again. */}
                {checkout.needsSession && checkout.sessionError && (
                  <MarketplaceSessionRequiredCard message={checkout.sessionError} />
                )}
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
            <Typography as="p" className="mt-2 text-muted-foreground">
              Items you add from listings appear here, saved on this device.
            </Typography>
            <Button asChild className="mt-6 rounded-full">
              <Link href={APP_ROUTES.MARKETPLACE} overrideDefaults>
                Browse the marketplace
              </Link>
            </Button>
          </div>
        )}
      </Container>
    </ContentLayout>
  );
}
