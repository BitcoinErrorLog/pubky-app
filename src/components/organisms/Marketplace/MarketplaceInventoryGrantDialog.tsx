'use client';

import { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Smartphone } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { useIsGrantSession } from '@/hooks/useIsGrantSession/useIsGrantSession';
import { useMarketplaceInventoryGrantConnect } from '@/hooks/useMarketplaceInventoryGrantConnect/useMarketplaceInventoryGrantConnect';
import { GrantSessionRefusal } from '@/molecules/GrantSessionRefusal/GrantSessionRefusal';
import { QrCodeSlot } from '@/molecules/QrCodeSlot/QrCodeSlot';
import { toast } from '@/molecules/Toaster/use-toast';

export function MarketplaceInventoryGrantDialog({
  triggerLabel = 'Approve in your Pubky signer',
  onConnected,
  autoOpen = false,
}: {
  triggerLabel?: string;
  onConnected?: () => void;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const grant = useMarketplaceInventoryGrantConnect({
    onConnected: () => {
      toast({
        title: 'Inventory grant approved',
        description: 'Stock edits use this grant. Checkout still uses your purchase session.',
      });
      setOpen(false);
      onConnected?.();
    },
  });

  const { start, cancel } = grant;
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const isGrantSession = useIsGrantSession();
  useEffect(() => {
    if (open) {
      if (!isGrantSession) start();
      return;
    }
    cancel();
  }, [open, start, cancel, isGrantSession]);

  const copyUrl = async () => {
    try {
      await grant.copyAuthUrl();
      toast({ variant: 'info', title: 'Authorization link copied' });
    } catch {
      toast({ variant: 'error', description: 'Could not copy to clipboard' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full">
          <KeyRound className="mr-2 size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-popover">
        <DialogHeader>
          <DialogTitle>Approve inventory access</DialogTitle>
        </DialogHeader>
        <Typography as="p" className="text-sm text-muted-foreground">
          Approve this grant in Bitkit or Pubky Ring; it does not replace your purchase session.
        </Typography>
        {isGrantSession ? (
          <GrantSessionRefusal />
        ) : grant.status === 'error' ? (
          <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
            {grant.errorMessage}
          </div>
        ) : (
          <div className="grid justify-items-center gap-4">
            <button
              type="button"
              className="group relative flex size-48 cursor-pointer items-center justify-center rounded-md bg-foreground p-2"
              onClick={() => void copyUrl()}
              disabled={!grant.authorizationUrl}
              aria-label="Copy authorization link"
            >
              <QrCodeSlot
                isLoading={grant.status !== 'awaiting'}
                isExpired={false}
                url={grant.authorizationUrl}
                generatingLabel="Generating QR Code..."
                clickToReloadLabel="Click to reload"
                activeQrHasHoverEffect
              />
            </button>
            {grant.status === 'awaiting' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                Waiting for approval on your signer…
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={grant.openInSigner}
                disabled={!grant.authorizationUrl || grant.isOpeningSigner}
              >
                <Smartphone className="mr-2 size-4" />
                Open in Bitkit / Ring
              </Button>
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={() => void copyUrl()}
                disabled={!grant.authorizationUrl}
              >
                <Copy className="mr-2 size-4" />
                Copy link
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" className="rounded-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
