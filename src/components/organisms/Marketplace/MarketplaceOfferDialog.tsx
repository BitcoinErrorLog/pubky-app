'use client';

import { useState } from 'react';
import { HandCoins } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { useMarketplaceOffer } from '@/hooks/useMarketplaceOffer/useMarketplaceOffer';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { amountInputUnitLabel, type CommerceAsset, isBitcoinAsset } from '@/libs/commerce/pricing';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';

export function MarketplaceOfferDialog({
  aggregateId,
  expectedRevision,
  priceAsset,
  onAccepted,
}: {
  aggregateId: string;
  expectedRevision: number | null;
  /** The listing's own pricing asset — offers are made in it, never converted. */
  priceAsset: CommerceAsset;
  onAccepted: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  // `onAccepted` refreshes the projection, which is exactly the recovery a
  // revision conflict needs: reload the terms/revision, then the user re-offers.
  const offer = useMarketplaceOffer(aggregateId, expectedRevision, onAccepted, priceAsset);
  const { requireAuth } = useRequireAuth();

  const submit = async () => {
    if (!(await offer.submit())) return;
    setOpen(false);
    offer.reset();
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
        <Button size="lg" variant="secondary" className="flex-1 rounded-full" disabled={expectedRevision === null}>
          <HandCoins className="mr-2 size-4" />
          Make offer
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-popover">
        <DialogHeader>
          <DialogTitle>Make a private offer</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <ControlledInputField
            name="amount"
            control={offer.form.control}
            label={`Offer amount (${amountInputUnitLabel(priceAsset)})`}
            placeholder={isBitcoinAsset(priceAsset) ? '100000' : '100.00'}
          />
          <ControlledInputField name="quantity" control={offer.form.control} label="Quantity" placeholder="1" />
          <ControlledTextareaField
            name="message"
            control={offer.form.control}
            label="Message (optional)"
            placeholder="Add context for the seller"
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="secondary" className="rounded-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={submit}>
            Send offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
