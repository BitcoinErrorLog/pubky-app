'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Download, FileWarning, KeyRound, LoaderCircle, WalletCards } from 'lucide-react';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { type CommerceAdapterMode, isLocksPaykitCommerceMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceLocksPayment } from '@/hooks/useMarketplaceLocksPayment/useMarketplaceLocksPayment';
import { type BuyerVisiblePaymentStatus, buyerVisiblePaymentStatus } from '@/libs/commerce/locks-payment';
import type { CommerceDigitalLock } from '@/libs/commerce/marketplace-records';
import type { MarketplaceOrder, MarketplacePayment } from '@/services/marketplace/marketplace';

/**
 * The buyer-visible payment status vocabulary is deliberately small
 * (implementation plan, "Paykit, Locks, and payment confirmation"): awaiting
 * entitlement, confirmed, marketplace-expired, and manual review. Detection,
 * underpayment/overpayment, and confirmation counts stay internal to
 * Locks/Paykit Server and are never rendered as real facts — only the
 * visibly-labeled sandbox demonstrates the finer-grained simulated states.
 */
const BUYER_VISIBLE_STATUS_LABELS: Record<BuyerVisiblePaymentStatus, string> = {
  awaiting_entitlement: 'Awaiting payment',
  confirmed: 'Payment confirmed',
  expired: 'Payment window expired',
  manual_review: 'Under manual review',
};

function parseListingAggregateId(aggregateId: string): { sellerPubky: string; listingId: string } | null {
  if (!aggregateId.startsWith('listing:')) return null;
  const rest = aggregateId.slice('listing:'.length);
  if (rest.length < 54 || rest[52] !== '_') return null;
  return { sellerPubky: rest.slice(0, 52), listingId: rest.slice(53) };
}

/**
 * Truthful payment status for one order. Renders only the buyer-visible
 * states; never claims settlement detail the upstream contract keeps
 * internal; never advances a payment itself — in `locks-paykit` mode the
 * buyer's only actions are creating the payment request (proof bundle +
 * `payment.register_locks`) and, after server-side confirmation, unlocking
 * the purchased digital content.
 */
export function MarketplacePaymentStatusCard({
  order,
  payment,
  isBuyer,
  adapterMode,
  advancePayment,
  onPaymentChanged,
}: {
  order: MarketplaceOrder;
  payment: MarketplacePayment | null;
  isBuyer: boolean;
  adapterMode: CommerceAdapterMode;
  advancePayment: (
    payment: MarketplacePayment,
    target: 'detected' | 'confirmed' | 'expired' | 'manual_review',
    confirmations: number,
  ) => Promise<boolean>;
  onPaymentChanged: () => void | Promise<void>;
}) {
  const isSandbox = adapterMode === 'sandbox';
  const isLocksPaykit = isLocksPaykitCommerceMode(adapterMode);
  const [digitalLock, setDigitalLock] = useState<CommerceDigitalLock | null>(null);

  // The digital lock lives on the seller-signed listing record (cached
  // locally when the buyer browsed it; fetched from the seller's homeserver
  // otherwise). Without it there is nothing to pay through Locks.
  useEffect(() => {
    if (!isLocksPaykit) return;
    let active = true;
    const load = async () => {
      for (const line of order.lines) {
        const parsed = parseListingAggregateId(line.listingAggregateId);
        if (!parsed) continue;
        try {
          const record = await CommerceController.getOrFetchListing(parsed.sellerPubky, parsed.listingId);
          if (record.digitalLock) {
            if (active) setDigitalLock(record.digitalLock);
            return;
          }
        } catch {
          // An unreachable listing record just means no Locks flow is offered.
        }
      }
      if (active) setDigitalLock(null);
    };
    void load();
    return () => {
      active = false;
    };
  }, [isLocksPaykit, order.lines]);

  const locks = useMarketplaceLocksPayment({
    order,
    payment,
    digitalLock,
    isBuyer,
    onPaymentChanged,
  });

  if (!payment) return null;

  const visibleStatus = buyerVisiblePaymentStatus(payment.state);
  const isAwaiting = visibleStatus === 'awaiting_entitlement';

  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={visibleStatus === 'confirmed' ? 'default' : 'outline'}>
          {BUYER_VISIBLE_STATUS_LABELS[visibleStatus]}
        </Badge>
        {payment.adapter === 'locks' && <Badge variant="secondary">Locks/Paykit</Badge>}
        {isSandbox && <Badge variant="secondary">Sandbox · simulated payment · no real funds</Badge>}
      </div>

      {visibleStatus === 'expired' && (
        <Typography as="p" className="text-sm text-muted-foreground">
          The marketplace payment window elapsed before a verified payment arrived, so this order was not completed. A
          payment verified after expiry is reconciled manually — never silently applied or discarded.
        </Typography>
      )}
      {visibleStatus === 'manual_review' && (
        <Typography as="p" className="text-sm text-muted-foreground">
          A verified event arrived outside the normal flow (for example after the payment window expired), so an
          operator has to reconcile this order manually. No funds are held by this marketplace.
        </Typography>
      )}

      {/* Sandbox-only simulated detail, always under the visible sandbox label. */}
      {isSandbox && isBuyer && payment.state !== 'confirmed' && (
        <div className="flex flex-wrap gap-2">
          {payment.state === 'awaiting_entitlement' && (
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full"
              onClick={() => void advancePayment(payment, 'detected', 0)}
            >
              <Clock3 className="mr-2 size-4" />
              Simulate detected
            </Button>
          )}
          {(payment.state === 'awaiting_entitlement' || payment.state === 'detected') && (
            <Button size="sm" className="rounded-full" onClick={() => void advancePayment(payment, 'confirmed', 1)}>
              <CheckCircle2 className="mr-2 size-4" />
              Simulate confirmation
            </Button>
          )}
          {payment.state === 'detected' && (
            <Typography as="p" className="self-center text-xs text-muted-foreground">
              Simulated detection — a real deployment never shows unconfirmed detection as payment.
            </Typography>
          )}
        </div>
      )}

      {/* Durable mode without payment rails: the order honestly waits. */}
      {adapterMode === 'transaction-service' && isBuyer && isAwaiting && (
        <Typography as="p" className="text-sm text-muted-foreground">
          Real payments are not enabled in this deployment, and this client never simulates them against the durable
          service — the order stays awaiting payment.
        </Typography>
      )}

      {/* locks-paykit: the real buyer flow. */}
      {isLocksPaykit && isBuyer && isAwaiting && !digitalLock && (
        <Typography as="p" className="text-sm text-muted-foreground">
          This order has no Locks-guarded digital item, so no Paykit payment request can be created for it yet.
        </Typography>
      )}
      {isLocksPaykit && isBuyer && isAwaiting && digitalLock && !locks.correlation && (
        <div className="grid gap-2">
          <Typography as="p" className="text-sm text-muted-foreground">
            Paykit delivers the Bitcoin payment request privately to your wallet. This app never holds wallet keys and
            never confirms a payment itself — the marketplace verifies the Locks entitlement server-side.
          </Typography>
          <Button className="w-fit rounded-full" disabled={locks.isStarting} onClick={() => void locks.start()}>
            {locks.isStarting ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <WalletCards className="mr-2 size-4" />
            )}
            Request payment in your wallet
          </Button>
        </div>
      )}
      {isLocksPaykit && isBuyer && isAwaiting && digitalLock && locks.correlation && !locks.correlation.registered && (
        <div className="grid gap-2">
          <Typography as="p" className="text-sm text-muted-foreground">
            The payment request was created but its registration with the marketplace did not complete. Retry the
            registration — the same request is reused, nothing is charged twice.
          </Typography>
          <Button
            variant="secondary"
            className="w-fit rounded-full"
            disabled={locks.isStarting}
            onClick={() => void locks.start()}
          >
            Retry registration
          </Button>
        </div>
      )}
      {isLocksPaykit && isBuyer && isAwaiting && locks.correlation?.registered && (
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Payment request sent. Check your wallet for the private Paykit request; this page updates once the
            marketplace independently verifies the payment.
          </div>
          {locks.pollExhausted && (
            <Button variant="secondary" size="sm" className="w-fit rounded-full" onClick={locks.resumePolling}>
              Keep checking
            </Button>
          )}
        </div>
      )}

      {/* Digital delivery after server-side confirmation. */}
      {isLocksPaykit && isBuyer && visibleStatus === 'confirmed' && locks.correlation && (
        <div className="grid gap-2 rounded-lg bg-brand/10 p-3">
          <div className="flex items-center gap-2 text-sm text-brand">
            <KeyRound className="size-4" />
            Digital delivery is ready: a short-lived Locks access credential unlocks the purchased content.
          </div>
          {locks.delivery ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <CheckCircle2 className="size-4 text-brand" />
              <span>
                {locks.delivery.fileName} · {locks.delivery.byteSize} bytes · integrity verified
              </span>
              <Button asChild size="sm" variant="secondary" className="rounded-full">
                <a href={locks.delivery.objectUrl} download={locks.delivery.fileName}>
                  <Download className="mr-2 size-4" />
                  Save file
                </a>
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="w-fit rounded-full"
              disabled={locks.isUnlocking}
              onClick={() => void locks.unlock()}
            >
              {locks.isUnlocking ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
              Unlock content
            </Button>
          )}
        </div>
      )}

      {locks.error && (
        <Typography as="p" role="alert" className="flex items-center gap-2 text-sm text-amber-300">
          <FileWarning className="size-4" />
          {locks.error}
        </Typography>
      )}
    </div>
  );
}
