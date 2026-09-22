'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Banknote, Check, CreditCard, LoaderCircle, WalletCards } from 'lucide-react';
import { Controller, useWatch } from 'react-hook-form';
import { getMarketplaceListingRoute, MARKETPLACE_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Checkbox } from '@/atoms/Checkbox/Checkbox';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Label } from '@/atoms/Label/Label';
import { Link } from '@/atoms/Link/Link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { getCommerceAdapterMode, isDurableCommerceMode, isLocksPaykitCommerceMode } from '@/config/commerce';
import { MARKETPLACE_DELIVERY_ADDRESS_DISCLOSURE } from '@/config/commerce-copy';
import { CommerceController } from '@/controllers/commerce/commerce';
import {
  type MarketplaceCartGroup,
  marketplaceCartShippingTotals,
  useMarketplaceCart,
} from '@/hooks/useMarketplaceCart/useMarketplaceCart';
import { useMarketplaceCheckout } from '@/hooks/useMarketplaceCheckout/useMarketplaceCheckout';
import { marketplaceCheckoutSchema } from '@/hooks/useMarketplaceCheckout/useMarketplaceCheckout.types';
import { useMarketplaceMediaUrl } from '@/hooks/useMarketplaceMediaUrl/useMarketplaceMediaUrl';
import { useMarketplaceOrders } from '@/hooks/useMarketplaceOrders/useMarketplaceOrders';
import { useMarketplaceSellerSummary } from '@/hooks/useMarketplaceSellerSummary/useMarketplaceSellerSummary';
import {
  buyerCheckoutStateLabel,
  getMarketplaceCheckoutRoute,
  intersectPaymentMethods,
  isPaidOrLaterState,
  readCheckoutHashOrderId,
  reservedWhileYouPayCopy,
} from '@/libs/commerce/checkout-phase';
import { formatCommerceMoney } from '@/libs/commerce/format';
import { availablePaymentMethods, type PaymentMethodKind } from '@/libs/commerce/payment-methods';
import { getDeployEnv } from '@/libs/runtime-config/runtime-config';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { MarketplaceAddressFields } from '@/molecules/MarketplaceAddressFields/MarketplaceAddressFields';
import { MarketplaceSellerIdentity } from '@/molecules/MarketplaceSellerIdentity/MarketplaceSellerIdentity';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceIndicativePrice } from '@/organisms/Marketplace/MarketplaceIndicativePrice';
import { MarketplacePaymentStatusCard } from '@/organisms/Marketplace/MarketplacePaymentStatusCard';
import { MarketplaceSectionNav } from '@/organisms/Marketplace/MarketplaceSectionNav';
import { MarketplaceSessionRequiredCard } from '@/organisms/Marketplace/MarketplaceSessionRequiredCard';
import { MarketplaceAwardCheckout } from './MarketplaceAwardCheckout';
import { MarketplaceCartSkeleton } from './MarketplaceCart.skeleton';

const METHOD_COPY: Record<PaymentMethodKind, string> = {
  bitcoin: '₿ Bitcoin',
  stripe: 'Card (Stripe)',
  paypal: 'PayPal',
};

export function MarketplaceCheckout() {
  const searchParams = useSearchParams();
  const offerReference = searchParams.get('offer');
  if (offerReference) return <MarketplaceAwardCheckout />;
  return <MarketplaceCartCheckout />;
}

function MarketplaceCartCheckout() {
  const cart = useMarketplaceCart();
  const ordinaryItems = cart.ordinaryItems ?? cart.items;
  const checkout = useMarketplaceCheckout(ordinaryItems, cart.clear);
  const orders = useMarketplaceOrders();
  const adapterMode = getCommerceAdapterMode();
  const isSandbox = adapterMode === 'sandbox';
  const isStaging = getDeployEnv() === 'staging';
  const formValues = useWatch({ control: checkout.form.control });
  const formValid = marketplaceCheckoutSchema.safeParse(formValues).success;
  const shipping = marketplaceCartShippingTotals(cart.groups, checkout.fulfillmentForSeller);
  const totalSubtotals = [...cart.subtotals, ...shipping.totals].reduce<
    Array<{ amountMinor: number; currency: string; exponent: number }>
  >((totals, money) => {
    const existing = totals.find(
      (candidate) => candidate.currency === money.currency && candidate.exponent === money.exponent,
    );
    if (existing) existing.amountMinor += money.amountMinor;
    else totals.push({ ...money });
    return totals;
  }, []);
  const sessionExpired = Boolean(checkout.needsSession && checkout.sessionError);
  const approvalNeeded = isDurableCommerceMode(adapterMode) && (!checkout.hasMarketplaceSession || sessionExpired);
  const [hashOrderId, setHashOrderId] = useState<string | null>(null);
  const [payingOrderIds, setPayingOrderIds] = useState<string[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodKind | null>(null);
  const [sharedMethods, setSharedMethods] = useState<PaymentMethodKind[] | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const sellerKey = useMemo(
    () => [...new Set(ordinaryItems.map((item) => item.listing.record.ownerPubky))].join('|'),
    [ordinaryItems],
  );

  useEffect(() => {
    const syncHash = () => setHashOrderId(readCheckoutHashOrderId(window.location.hash));
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  useEffect(() => {
    const sellers = sellerKey.length === 0 ? [] : sellerKey.split('|');
    if (sellers.length === 0) {
      setSharedMethods([]);
      return;
    }
    let active = true;
    void Promise.all(
      sellers.map(async (sellerPubky) => {
        try {
          return availablePaymentMethods(await CommerceController.getSellerPaymentConfig(sellerPubky));
        } catch {
          return [] as PaymentMethodKind[];
        }
      }),
    ).then((sets) => {
      if (!active) return;
      const next = intersectPaymentMethods(sets);
      setSharedMethods(next);
      setSelectedMethod((current) => (current && next.includes(current) ? current : (next[0] ?? null)));
    });
    return () => {
      active = false;
    };
  }, [sellerKey]);

  const targetPayingIds = [...new Set([...payingOrderIds, ...(hashOrderId ? [hashOrderId] : [])])];
  const focusedPaying = orders.orders.filter((view) => targetPayingIds.includes(view.order.id));
  const showPaying = targetPayingIds.length > 0;
  const payingOrder = focusedPaying[0]?.order;
  const holdCopy =
    payingOrder && payingOrder.paymentMethod
      ? reservedWhileYouPayCopy(payingOrder.holdExpiresAt, nowMs)
      : payingOrder
        ? buyerCheckoutStateLabel(payingOrder)
        : null;

  useEffect(() => {
    if (!showPaying) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [showPaying]);

  const canPay =
    !approvalNeeded &&
    formValid &&
    !checkout.hasFulfillmentConflict &&
    !checkout.isPaying &&
    (isSandbox || (sharedMethods !== null && sharedMethods.length > 0 && selectedMethod !== null));

  const pay = async () => {
    const method = isSandbox && selectedMethod === null ? null : selectedMethod;
    const result = await checkout.pay(method);
    if (!result.ok) return;
    setPayingOrderIds(result.orderIds);
    if (result.orderIds[0]) {
      window.history.replaceState(null, '', getMarketplaceCheckoutRoute(result.orderIds[0]));
      setHashOrderId(result.orderIds[0]);
    }
    const fiatBound = result.boundOrders.filter((order) => order.fiatCheckoutUrl);
    if (fiatBound.length === 1 && fiatBound[0].fiatCheckoutUrl) {
      window.location.assign(fiatBound[0].fiatCheckoutUrl);
      return;
    }
    await orders.refresh();
  };

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28"
      classNameWrapperContent="max-w-7xl"
    >
      <Container
        overrideDefaults
        className="flex w-full flex-col gap-6 px-4 sm:px-6"
        data-surface="marketplace-checkout"
        data-testid="marketplace-checkout"
      >
        <MarketplaceSectionNav />
        <Link href={MARKETPLACE_ROUTES.CART} overrideDefaults className="text-sm text-muted-foreground">
          Back to cart
        </Link>
        <div>
          <Heading level={1} size="xl" className="text-4xl sm:text-6xl">
            Checkout
          </Heading>
          <Typography as="p" className="mt-2 text-muted-foreground">
            Address and payment. Nothing is reserved until you pay.
          </Typography>
        </div>

        {showPaying ? (
          <div className="grid gap-4" data-testid="marketplace-checkout-paying">
            {holdCopy && (
              <Typography as="p" className="rounded-xl border bg-card/60 px-4 py-3 text-sm">
                {holdCopy}
              </Typography>
            )}
            {orders.isLoading && focusedPaying.length === 0 ? (
              <Skeleton className="h-40 w-full" aria-label="Loading checkout" />
            ) : focusedPaying.length === 0 ? (
              <Card className="border">
                <CardContent className="grid gap-3 px-6">
                  <Typography as="p">This checkout is no longer waiting for payment.</Typography>
                  <Button asChild className="w-fit rounded-full">
                    <Link href={MARKETPLACE_ROUTES.ORDERS} overrideDefaults>
                      View orders
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              focusedPaying.map(({ order, payment }) => (
                <Card key={order.id} className="border">
                  <CardContent className="grid gap-4 px-6">
                    {isPaidOrLaterState(order.state) ? <Typography as="p">Payment confirmed.</Typography> : null}
                    <MarketplacePaymentStatusCard
                      order={order}
                      payment={payment}
                      isBuyer
                      adapterMode={adapterMode}
                      advancePayment={orders.advancePayment}
                      onPaymentChanged={orders.refresh}
                    />
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : cart.isLoading ? (
          <MarketplaceCartSkeleton />
        ) : ordinaryItems.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center">
            <Heading level={2} size="md">
              Nothing to check out
            </Heading>
            <Typography as="p" className="mt-2 text-muted-foreground">
              Add items in your cart first.
            </Typography>
            <Button asChild className="mt-6 rounded-full">
              <Link href={MARKETPLACE_ROUTES.CART} overrideDefaults>
                Back to cart
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
            <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-1">
              {cart.groups.map((group) => {
                const fulfillmentOptions = checkout.fulfillmentOptionsForSeller(group.sellerPubky);
                const fulfillment = checkout.fulfillmentForSeller(group.sellerPubky);
                const isPickupGroup = fulfillment === 'pickup';
                return (
                  <section
                    key={group.sellerPubky}
                    className="grid gap-3"
                    aria-label={`Items from ${group.sellerPubky}`}
                    data-surface={isPickupGroup ? 'checkout-pickup-group' : undefined}
                  >
                    {cart.groups.length > 1 && <MarketplaceCheckoutSellerHeader group={group} />}
                    {checkout.isPickupCapabilityLoading ? (
                      <Skeleton
                        className="h-16 w-full"
                        data-testid="pickup-capability-skeleton"
                        aria-label="Checking pickup availability"
                      />
                    ) : null}
                    {!checkout.isPickupCapabilityLoading && fulfillmentOptions.length > 1 && fulfillment && (
                      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/60 px-4 py-3">
                        <Label htmlFor={`fulfillment-${group.sellerPubky}`}>Fulfillment</Label>
                        <Select
                          value={fulfillment}
                          onValueChange={(value) => {
                            if (value === 'shipping' || value === 'pickup') {
                              checkout.setFulfillmentChoice(group.sellerPubky, value);
                            }
                          }}
                        >
                          <SelectTrigger
                            id={`fulfillment-${group.sellerPubky}`}
                            className="h-11 w-56 rounded-md border px-3"
                            aria-label={`Fulfillment for items from ${group.sellerPubky}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {fulfillmentOptions.includes('shipping') && (
                              <SelectItem value="shipping">Ship it</SelectItem>
                            )}
                            {fulfillmentOptions.includes('pickup') && (
                              <SelectItem value="pickup">Local pickup</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {!checkout.isPickupCapabilityLoading && isPickupGroup && (
                      <Typography
                        as="p"
                        className="rounded-xl border bg-card/60 px-4 py-3 text-sm text-muted-foreground"
                      >
                        Local pickup — no delivery address or shipping for these items. The meeting point is revealed
                        after payment confirms.
                      </Typography>
                    )}
                    {!checkout.isPickupCapabilityLoading && fulfillmentOptions.length === 0 && (
                      <Typography
                        as="p"
                        role="alert"
                        className="rounded-xl border border-destructive/40 px-4 py-3 text-sm"
                      >
                        These items can&apos;t be checked out together: they don&apos;t share a fulfillment method this
                        deployment supports (one ships while another is pickup-only). Remove one in the cart to
                        continue.
                      </Typography>
                    )}
                    {group.items.map((item) => {
                      const variant = item.listing.record.variants.find(({ id }) => id === item.variantId);
                      const price =
                        variant?.priceOverride ??
                        (item.listing.record.sale.format === 'fixed_price' ? item.listing.record.sale.unitPrice : null);
                      const listingRoute = getMarketplaceListingRoute(
                        item.listing.record.ownerPubky,
                        item.listing.listing_id,
                      );
                      return (
                        <Card key={item.id} className="border py-4">
                          <CardContent className="flex items-center gap-4 px-4">
                            <div className="min-w-0 flex-1">
                              <Typography as="h2" className="truncate font-semibold">
                                <Link href={listingRoute} overrideDefaults className="hover:text-brand hover:underline">
                                  {item.listing.record.title}
                                </Link>
                              </Typography>
                              <Typography as="p" className="text-sm text-muted-foreground">
                                {variant ? Object.values(variant.options).join(' · ') || 'Default' : 'Default'} · Qty{' '}
                                {item.quantity}
                              </Typography>
                              {price && (
                                <Typography as="p" className="mt-1 font-bold text-brand">
                                  {formatCommerceMoney(price)}{' '}
                                  <MarketplaceIndicativePrice money={price} className="font-normal" />
                                </Typography>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </section>
                );
              })}

              <Card className="h-fit border">
                <CardContent className="grid gap-6 px-6">
                  <section className="grid gap-3" aria-label="Approve in Pubky Ring">
                    <Heading level={2} size="sm" className="text-xl font-semibold">
                      Approve in Pubky Ring
                    </Heading>
                    {approvalNeeded ? (
                      <MarketplaceSessionRequiredCard />
                    ) : (
                      <div className="flex items-start gap-3 rounded-xl border px-4 py-3">
                        <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                        <Typography as="p" className="text-sm text-muted-foreground">
                          {isSandbox
                            ? 'Sandbox checkout does not need a Pubky Ring approval.'
                            : 'Purchases approved in Pubky Ring. This session stays on this device until it expires or you sign out.'}
                        </Typography>
                      </div>
                    )}
                  </section>
                </CardContent>
              </Card>

              {checkout.requiresDeliveryAddress && (
                <section className="grid gap-4" aria-label="Delivery address">
                  <Heading level={2} size="sm" className="text-xl font-semibold">
                    Delivery address
                  </Heading>
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
                    </div>
                  )}
                  <Typography as="p" className="rounded-xl border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
                    {MARKETPLACE_DELIVERY_ADDRESS_DISCLOSURE}
                  </Typography>
                  <ControlledInputField name="name" control={checkout.form.control} label="Recipient" />
                  <MarketplaceAddressFields control={checkout.form.control} setValue={checkout.form.setValue} />
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
                </section>
              )}
            </div>

            <Card
              className="h-fit border lg:col-start-2 lg:row-start-1 lg:self-start"
              data-testid="marketplace-checkout-summary"
            >
              <CardContent className="grid gap-6 px-6">
                <section className="grid gap-3" aria-label="Pay">
                  <Heading level={2} size="sm" className="text-xl font-semibold">
                    Pay
                  </Heading>
                  <div className="flex justify-between">
                    <Typography as="span">Items</Typography>
                    <div className="flex flex-col items-end">
                      {cart.subtotals.map((subtotal) => (
                        <Typography key={`${subtotal.currency}:${subtotal.exponent}`} as="span" className="font-bold">
                          {formatCommerceMoney(subtotal)}{' '}
                          <MarketplaceIndicativePrice money={subtotal} className="font-normal" />
                        </Typography>
                      ))}
                    </div>
                  </div>
                  {shipping.totals.length > 0 && (
                    <div className="flex justify-between">
                      <Typography as="span">Shipping</Typography>
                      <div className="flex flex-col items-end">
                        {shipping.totals.map((subtotal) => (
                          <Typography key={`${subtotal.currency}:${subtotal.exponent}`} as="span" className="font-bold">
                            {formatCommerceMoney(subtotal)}{' '}
                            <MarketplaceIndicativePrice money={subtotal} className="font-normal" />
                          </Typography>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-3">
                    <Typography as="span" className="font-semibold">
                      Total
                    </Typography>
                    <div className="flex flex-col items-end">
                      {totalSubtotals.map((subtotal) => (
                        <Typography key={`${subtotal.currency}:${subtotal.exponent}`} as="span" className="font-bold">
                          {formatCommerceMoney(subtotal)}{' '}
                          <MarketplaceIndicativePrice money={subtotal} className="font-normal" />
                        </Typography>
                      ))}
                    </div>
                  </div>
                  <Typography as="p" className="text-xs text-muted-foreground">
                    {shipping.hasCalculatedShipping
                      ? 'Shipping calculated at checkout for the items that ship.'
                      : shipping.totals.length > 0
                        ? 'Shipping is shown from each seller’s configured flat or free option.'
                        : checkout.requiresDeliveryAddress
                          ? 'Shipping is calculated authoritatively at checkout for the items that ship.'
                          : 'No shipping — pickup is arranged with the seller after payment.'}
                  </Typography>
                  {checkout.orderCount > 1 && (
                    <Typography as="p" className="text-xs text-muted-foreground">
                      This starts {checkout.orderCount} checkouts — one per seller and delivery method.
                    </Typography>
                  )}
                  {isStaging && (
                    <Typography
                      as="p"
                      role="note"
                      className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
                    >
                      Staging environment — test rails, no real funds move
                    </Typography>
                  )}
                  <div className="grid gap-2">
                    <Typography as="p" className="font-medium">
                      Payment method
                    </Typography>
                    {sharedMethods === null ? (
                      <Skeleton className="h-11 w-full" aria-label="Loading payment methods" />
                    ) : sharedMethods.length === 0 && !isSandbox ? (
                      <Typography as="p" role="alert" className="text-sm text-muted-foreground">
                        These sellers do not share a payment method, so Pay stays disabled. Remove a seller in the cart
                        or ask them to add a shared rail.
                      </Typography>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(isSandbox ? (['bitcoin', 'stripe', 'paypal'] as PaymentMethodKind[]) : sharedMethods).map(
                          (method) => (
                            <Button
                              key={method}
                              type="button"
                              size="sm"
                              variant={selectedMethod === method ? 'default' : 'secondary'}
                              className="rounded-full"
                              data-testid={`marketplace-checkout-method-${method}`}
                              onClick={() => setSelectedMethod(method)}
                            >
                              {method === 'bitcoin' && <WalletCards className="mr-2 size-4" />}
                              {method === 'stripe' && <CreditCard className="mr-2 size-4" />}
                              {method === 'paypal' && <Banknote className="mr-2 size-4" />}
                              {METHOD_COPY[method]}
                            </Button>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    className="w-full rounded-full"
                    onClick={() => void pay()}
                    disabled={!canPay}
                    data-testid="marketplace-checkout-pay"
                    aria-describedby={!canPay && !approvalNeeded ? 'checkout-pay-reason' : undefined}
                  >
                    {checkout.isPaying ? (
                      <>
                        <LoaderCircle className="mr-2 size-4 animate-spin" />
                        Paying
                      </>
                    ) : isSandbox ? (
                      'Pay sandbox'
                    ) : (
                      'Pay'
                    )}
                  </Button>
                  {!isStaging && !isSandbox && (
                    <Typography as="p" className="text-xs text-muted-foreground">
                      Paid directly to the seller.
                    </Typography>
                  )}
                  {!canPay && !approvalNeeded && (
                    <Typography id="checkout-pay-reason" as="p" className="text-xs text-muted-foreground">
                      {checkout.hasFulfillmentConflict
                        ? "Some items can't be checked out together — see the note above."
                        : sharedMethods && sharedMethods.length === 0 && !isSandbox
                          ? 'Choose sellers that share a payment method.'
                          : 'Fill in delivery details, accept the guarantee, and choose a payment method to pay.'}
                    </Typography>
                  )}
                </section>
                <section className="grid gap-4 border-t pt-4" aria-label="Guarantee">
                  <Heading level={2} size="sm" className="text-xl font-semibold">
                    Guarantee
                  </Heading>
                  {!checkout.requiresDeliveryAddress && (
                    <div className="rounded-xl border bg-card/60 p-4">
                      <Typography as="p" className="text-sm font-medium">
                        Local pickup
                      </Typography>
                      <Typography as="p" className="mt-1 text-xs text-muted-foreground">
                        No delivery address is needed — every item here is collected in person. The seller&apos;s
                        meeting point is revealed as soon as your payment confirms.
                      </Typography>
                    </div>
                  )}
                  <Controller
                    name="acceptsGuarantee"
                    control={checkout.form.control}
                    render={({ field, fieldState }) => (
                      <div className="grid gap-2">
                        <Label className="items-start gap-3">
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            onBlur={field.onBlur}
                            aria-invalid={fieldState.error ? true : undefined}
                          />
                          <span>
                            {isSandbox
                              ? 'I accept sandbox guarantee policy v1. This is not legal escrow and moves no real funds.'
                              : isLocksPaykitCommerceMode(adapterMode)
                                ? 'I accept guarantee policy v1. This is not legal escrow — payment goes from your wallet directly to the seller, and this marketplace never holds funds.'
                                : 'I accept guarantee policy v1. This is not legal escrow, and no payment rails are live in this deployment — no real funds move.'}
                          </span>
                        </Label>
                        {fieldState.error && (
                          <Typography as="p" role="alert" className="text-sm text-destructive">
                            {fieldState.error.message}
                          </Typography>
                        )}
                      </div>
                    )}
                  />
                </section>
              </CardContent>
            </Card>
          </div>
        )}
      </Container>
    </ContentLayout>
  );
}

function MarketplaceCheckoutSellerHeader({ group }: { group: MarketplaceCartGroup }) {
  const seller = useMarketplaceSellerSummary(group.sellerPubky, { includeReputation: false });
  const avatarUrl = useMarketplaceMediaUrl(seller.shop?.record.avatarUrl);

  return (
    <Card className="border py-4">
      <CardContent className="flex flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between">
        <MarketplaceSellerIdentity
          sellerPubky={group.sellerPubky}
          displayName={seller.displayName}
          avatarUrl={avatarUrl}
          avatarAlt={`${seller.shop?.record.name ?? 'Shop'} avatar`}
          reputation={seller.reputation}
        />
        <div className="flex flex-col gap-1 sm:items-end">
          <Typography as="p" className="text-sm text-muted-foreground">
            Seller subtotal
          </Typography>
          {group.subtotals.map((subtotal) => (
            <Typography key={`${subtotal.currency}:${subtotal.exponent}`} as="p" className="font-bold text-brand">
              {formatCommerceMoney(subtotal)} <MarketplaceIndicativePrice money={subtotal} className="font-normal" />
            </Typography>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
