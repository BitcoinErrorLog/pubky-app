'use client';

import { KeyRound, LoaderCircle, WalletCards } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Typography } from '@/atoms/Typography/Typography';
import { useLocksPayment } from '@/hooks/useLocksPayment/useLocksPayment';

export function MarketplaceLocksPayment({
  creatorPubky,
  lockResource,
  criterionId,
}: {
  creatorPubky: string;
  lockResource: string;
  criterionId: string;
}) {
  const payment = useLocksPayment({ creatorPubky, lockResource, criterionId });

  return (
    <Card className="gap-4 border border-brand/30 py-5">
      <CardContent className="grid gap-4 px-5">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-brand/15 p-2 text-brand">
            <KeyRound className="size-5" />
          </div>
          <div>
            <Typography as="h2" className="font-semibold">
              Locks-protected digital delivery
            </Typography>
            <Typography as="p" className="text-sm text-muted-foreground">
              Paykit sends the private Bitcoin request to Bitkit. Pubky App never receives wallet keys.
            </Typography>
          </div>
        </div>

        {payment.credential ? (
          <div className="rounded-lg bg-brand/10 p-3 text-sm text-brand">
            Payment entitlement verified. A short-lived content credential is ready.
          </div>
        ) : payment.lifecycle ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Locks status: {payment.lifecycle.status.replaceAll('_', ' ')}. Check Bitkit for the private request.
          </div>
        ) : (
          <Button className="w-full rounded-full" disabled={payment.isStarting} onClick={payment.start}>
            <WalletCards className="mr-2 size-4" />
            Request Paykit payment
          </Button>
        )}

        {payment.error && (
          <Typography as="p" role="status" className="text-sm text-amber-300">
            {payment.error}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
