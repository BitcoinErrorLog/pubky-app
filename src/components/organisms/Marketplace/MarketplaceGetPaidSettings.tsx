'use client';

import { useEffect, useState } from 'react';
import { Banknote, CheckCircle2, Copy, Loader2, LoaderCircle, RefreshCw, Smartphone, Trash2 } from 'lucide-react';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Switch } from '@/atoms/Switch/Switch';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceSellerPaymentConfig } from '@/hooks/useMarketplaceSellerPaymentConfig/useMarketplaceSellerPaymentConfig';
import { Logger } from '@/libs/logger/logger';
import { copyToClipboard } from '@/libs/utils/utils';
import { QrCodeSlot } from '@/molecules/QrCodeSlot/QrCodeSlot';
import { toast } from '@/molecules/Toaster/use-toast';
import { MarketplaceSessionConnectDialog } from '@/organisms/Marketplace/MarketplaceSessionConnectDialog';
import { useCommerceStore } from '@/stores/commerce/commerce.store';

/**
 * The seller's "Get paid" configuration: which rails buyers can pay through
 * and where the money lands. Everything here is seller-direct — bitcoin
 * settles to the seller's own claimed watch-only account, Stripe/PayPal
 * settle into the seller's own processor accounts. This marketplace never
 * receives funds on any rail.
 */
export function MarketplaceGetPaidSettings() {
  const marketplaceSession = useCommerceStore((state) => state.marketplaceSession);
  const payments = useMarketplaceSellerPaymentConfig();

  const [bitcoinEnabled, setBitcoinEnabled] = useState(false);
  const [stripePaymentLink, setStripePaymentLink] = useState('');
  const [stripeRestrictedKey, setStripeRestrictedKey] = useState('');
  const [paypalMerchantEmail, setPaypalMerchantEmail] = useState('');
  const [xpubInput, setXpubInput] = useState('');
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);

  useEffect(() => {
    if (!payments.config) return;
    setBitcoinEnabled(payments.config.bitcoinEnabled);
    setStripePaymentLink(payments.config.stripePaymentLink ?? '');
    setPaypalMerchantEmail(payments.config.paypalMerchantEmail ?? '');
  }, [payments.config]);

  useEffect(() => {
    if (payments.claimStatus === 'claimed') setClaimDialogOpen(false);
  }, [payments.claimStatus]);

  const onSave = async () => {
    const saved = await payments.save({ bitcoinEnabled, stripePaymentLink, stripeRestrictedKey, paypalMerchantEmail });
    if (saved) setStripeRestrictedKey('');
  };

  const onStartClaim = () => {
    setClaimDialogOpen(true);
    payments.startClaim(xpubInput);
  };

  const onCloseClaimDialog = (open: boolean) => {
    setClaimDialogOpen(open);
    if (!open) payments.cancelClaim();
  };

  const copyClaimUrl = async () => {
    try {
      await copyToClipboard({ text: payments.claimAuthorizationUrl });
      toast({ variant: 'info', title: 'Authorization link copied' });
    } catch (error) {
      Logger.error('Failed to copy the claim authorization link', { error });
      toast({ variant: 'error', description: 'Could not copy to clipboard' });
    }
  };

  return (
    <Card className="border">
      <CardContent className="grid gap-5 px-6">
        <div className="flex gap-3">
          <Banknote className="mt-1 size-5 text-brand" />
          <div>
            <Typography as="h2" className="font-semibold">
              Get paid
            </Typography>
            <Typography as="p" className="text-sm text-muted-foreground">
              The payment methods buyers see on your orders. Every rail is yours: bitcoin settles to your own wallet
              account, card and PayPal payments land in your own processor accounts. This marketplace never holds your
              funds.
            </Typography>
          </div>
        </div>

        {!marketplaceSession ? (
          <div className="grid justify-items-start gap-3 rounded-xl border p-4">
            <Typography as="p" className="text-sm text-muted-foreground">
              Saving payment settings requires a marketplace session.
            </Typography>
            <MarketplaceSessionConnectDialog />
          </div>
        ) : payments.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading payment settings…
          </div>
        ) : payments.loadError ? (
          <Typography as="p" role="alert" className="text-sm text-amber-300">
            {payments.loadError}
          </Typography>
        ) : (
          <>
            <div className="grid gap-3 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="get-paid-bitcoin" className="font-medium">
                    Bitcoin
                  </Label>
                  <Typography as="p" className="text-sm text-muted-foreground">
                    Payment requests are delivered privately via Paykit and settle to your claimed watch-only account.
                  </Typography>
                </div>
                <Switch
                  id="get-paid-bitcoin"
                  checked={bitcoinEnabled}
                  onCheckedChange={setBitcoinEnabled}
                  aria-label="Accept bitcoin"
                />
              </div>
              {payments.accountClaimed === true ? (
                <Typography as="p" className="flex items-center gap-2 text-sm text-brand">
                  <CheckCircle2 className="size-4" />
                  Watch-only account claimed — payment requests derive fresh addresses from it.
                </Typography>
              ) : (
                <div className="grid gap-2">
                  <Typography as="p" className="text-sm text-muted-foreground">
                    {payments.accountClaimed === null
                      ? 'The Paykit server could not report your account state right now; claiming again is safe.'
                      : 'No watch-only account is claimed yet. Connect through Bitkit above, or paste your BIP84 account xpub — the same registration, without the wallet app. The xpub is watch-only: it can derive receiving addresses, never spend.'}
                  </Typography>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={xpubInput}
                      onChange={(event) => setXpubInput(event.target.value)}
                      placeholder="Account xpub (zpub/vpub/xpub/tpub…)"
                      autoComplete="off"
                      spellCheck={false}
                      className="h-10 max-w-md font-mono text-xs"
                      aria-label="Account xpub"
                    />
                    <Button
                      variant="secondary"
                      className="rounded-full"
                      disabled={!xpubInput.trim()}
                      onClick={onStartClaim}
                    >
                      Claim with signer
                    </Button>
                  </div>
                  {payments.claimStatus === 'error' && payments.claimError && (
                    <Typography as="p" role="alert" className="text-sm text-amber-300">
                      {payments.claimError}
                    </Typography>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-3 rounded-xl border p-4">
              <div>
                <Label htmlFor="get-paid-stripe-link" className="font-medium">
                  Stripe
                </Label>
                <Typography as="p" className="text-sm text-muted-foreground">
                  Buyers pay through your own Stripe payment link. The restricted key (rk_…, read-only) lets the
                  marketplace verify a payment against your Stripe account — it is stored server-side, never shown
                  again, and cannot move money.
                </Typography>
              </div>
              <Input
                id="get-paid-stripe-link"
                value={stripePaymentLink}
                onChange={(event) => setStripePaymentLink(event.target.value)}
                placeholder="https://buy.stripe.com/…"
                autoComplete="off"
                className="h-10 max-w-md"
                aria-label="Stripe payment link"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="password"
                  value={stripeRestrictedKey}
                  onChange={(event) => setStripeRestrictedKey(event.target.value)}
                  placeholder={payments.config?.stripeRestrictedKeySet ? 'Key stored — paste to replace' : 'rk_…'}
                  autoComplete="off"
                  className="h-10 max-w-md"
                  aria-label="Stripe restricted key"
                />
                {payments.config?.stripeRestrictedKeySet && (
                  <>
                    <Badge variant="secondary">Key stored</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                      disabled={payments.isSaving}
                      onClick={() => void payments.clearStripeKey()}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Remove key
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-3 rounded-xl border p-4">
              <div>
                <Label htmlFor="get-paid-paypal" className="font-medium">
                  PayPal
                </Label>
                <Typography as="p" className="text-sm text-muted-foreground">
                  Buyers pay your PayPal account directly. PayPal notifies the marketplace when a payment completes
                  (verified against this address and the exact order total), so orders usually mark themselves paid. If
                  no notification arrives, the buyer reports the payment and you confirm receipt on the order.
                </Typography>
              </div>
              <Input
                id="get-paid-paypal"
                type="email"
                value={paypalMerchantEmail}
                onChange={(event) => setPaypalMerchantEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="off"
                className="h-10 max-w-md"
                aria-label="PayPal merchant email"
              />
            </div>

            <Button className="w-fit rounded-full" disabled={payments.isSaving} onClick={() => void onSave()}>
              {payments.isSaving ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
              Save payment settings
            </Button>
          </>
        )}

        <Dialog open={claimDialogOpen} onOpenChange={onCloseClaimDialog}>
          <DialogContent className="border-border bg-popover">
            <DialogHeader>
              <DialogTitle>Claim watch-only account</DialogTitle>
            </DialogHeader>
            <Typography as="p" className="text-sm text-muted-foreground">
              Approving on your signer registers the pasted account xpub with the Paykit server — exactly what
              Bitkit&rsquo;s setup does. The approval is scoped to the Paykit receiver path and grants nothing else.
            </Typography>
            {payments.claimStatus === 'error' ? (
              <div className="grid gap-3">
                <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
                  {payments.claimError}
                </div>
                <Button className="w-fit rounded-full" onClick={onStartClaim}>
                  <RefreshCw className="mr-2 size-4" />
                  Try again
                </Button>
              </div>
            ) : (
              <div className="grid justify-items-center gap-4">
                <button
                  type="button"
                  className="group relative flex size-48 cursor-pointer items-center justify-center rounded-md bg-foreground p-2"
                  onClick={() => void copyClaimUrl()}
                  disabled={!payments.claimAuthorizationUrl}
                  aria-label="Copy authorization link"
                >
                  <QrCodeSlot
                    isLoading={payments.claimStatus !== 'awaiting'}
                    isExpired={false}
                    url={payments.claimAuthorizationUrl}
                    generatingLabel="Generating QR Code..."
                    clickToReloadLabel="Click to reload"
                    activeQrHasHoverEffect
                  />
                </button>
                {payments.claimStatus === 'awaiting' && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                    <Loader2 className="size-4 animate-spin" />
                    Waiting for approval on your signer…
                  </div>
                )}
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    variant="secondary"
                    className="rounded-full"
                    onClick={() => {
                      window.location.href = payments.claimAuthorizationUrl;
                    }}
                    disabled={!payments.claimAuthorizationUrl}
                  >
                    <Smartphone className="mr-2 size-4" />
                    Open in Pubky Ring
                  </Button>
                  <Button
                    variant="ghost"
                    className="rounded-full"
                    onClick={() => void copyClaimUrl()}
                    disabled={!payments.claimAuthorizationUrl}
                  >
                    <Copy className="mr-2 size-4" />
                    Copy link
                  </Button>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="secondary" className="rounded-full" onClick={() => onCloseClaimDialog(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
