'use client';

import { useState } from 'react';
import { Gavel } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceBid } from '@/hooks/useMarketplaceBid/useMarketplaceBid';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { formatCommerceMoney } from '@/libs/commerce/format';
import { amountInputUnitLabel, type CommerceAsset, isSatsAsset } from '@/libs/commerce/pricing';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import type { MarketplaceListingProjection } from '@/services/marketplace/marketplace';

export function MarketplaceBidDialog({
  aggregateId,
  projection,
  priceAsset,
  onAccepted,
}: {
  aggregateId: string;
  projection: MarketplaceListingProjection | null;
  /** The auction's own pricing asset — bids are made in it, never converted. */
  priceAsset: CommerceAsset;
  onAccepted: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  // `onAccepted` refreshes the projection, which is exactly the recovery a
  // revision conflict needs: reload the price/revision, then the user rebids.
  const bid = useMarketplaceBid(aggregateId, projection?.serverRevision ?? null, onAccepted, priceAsset);
  const { requireAuth } = useRequireAuth();

  const submit = async () => {
    if (!(await bid.submit())) return;
    setOpen(false);
    bid.reset();
    await onAccepted();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setOpen(false);
          return;
        }
        requireAuth(() => setOpen(true));
      }}
    >
      <DialogTrigger asChild>
        <Button size="lg" className="flex-1 rounded-full" disabled={!projection?.auction}>
          <Gavel className="mr-2 size-4" />
          Place a bid
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-popover">
        <DialogHeader>
          <DialogTitle>Set your private proxy maximum</DialogTitle>
        </DialogHeader>
        {projection?.auction && (
          <div className="rounded-xl border bg-card p-4">
            <Typography as="p" className="text-sm text-muted-foreground">
              Current visible price
            </Typography>
            <Typography as="p" className="text-2xl font-bold text-brand">
              {formatCommerceMoney(projection.auction.currentPrice)}
            </Typography>
            <Typography as="p" className="mt-1 text-sm text-muted-foreground">
              {projection.auction.bidCount} {projection.auction.bidCount === 1 ? 'bid' : 'bids'} ·{' '}
              {projection.auction.reserveMet ? 'Reserve met' : 'Reserve not met'}
            </Typography>
          </div>
        )}
        <ControlledInputField
          name="maximumAmount"
          control={bid.form.control}
          label={`Maximum bid (${amountInputUnitLabel(priceAsset)})`}
          placeholder={isSatsAsset(priceAsset) ? '100000' : '100.00'}
        />
        <Typography as="p" className="text-sm text-muted-foreground">
          Your maximum stays private. The visible price advances only enough to keep you ahead.
        </Typography>
        <DialogFooter>
          <Button variant="secondary" className="rounded-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={submit}>
            Confirm bid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
