'use client';

import { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceSessionConnect } from '@/hooks/useMarketplaceSessionConnect/useMarketplaceSessionConnect';
import { Logger } from '@/libs/logger/logger';
import { QrCodeSlot } from '@/molecules/QrCodeSlot/QrCodeSlot';
import { toast } from '@/molecules/Toaster/use-toast';

/**
 * The in-app UX for establishing a marketplace transaction-service session
 * (durable modes only). Mirrors the sign-in precedent: the `pubkyauth://`
 * authorization URL renders as a QR for a cross-device Pubky Ring scan, and
 * as a deeplink/copy affordance for same-device Ring.
 *
 * Every open starts a FRESH flow and closing cancels it — AuthTokens are
 * single-use, so a failed or abandoned flow's QR is never shown again. On
 * approval the controller mirrors the session facts into the commerce store,
 * which is what makes the dependent durable-mode surfaces refetch.
 */
export function MarketplaceSessionConnectDialog({ onConnected }: { onConnected?: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const session = useMarketplaceSessionConnect({
    onConnected: () => {
      toast({
        title: 'Marketplace session connected',
        description: 'This session stays on this device across tabs and restarts until it expires or you sign out.',
      });
      setOpen(false);
      void onConnected?.();
    },
  });

  // Referencing `session.start`/`session.cancel` directly keeps the effect
  // dependency-stable: both are useCallback-memoized in the hook.
  const { start, cancel } = session;
  useEffect(() => {
    if (open) {
      start();
      return;
    }
    cancel();
  }, [open, start, cancel]);

  const copyUrl = async () => {
    try {
      await session.copyAuthUrl();
      toast({ variant: 'info', title: 'Authorization link copied' });
    } catch (error) {
      Logger.error('Failed to copy the marketplace authorization link', { error });
      toast({ variant: 'error', description: 'Could not copy to clipboard' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full">
          <KeyRound className="mr-2 size-4" />
          Connect marketplace session
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-popover">
        <DialogHeader>
          <DialogTitle>Connect marketplace session</DialogTitle>
        </DialogHeader>

        <Typography as="p" className="text-sm text-muted-foreground">
          Approving with your signer (Pubky Ring) authorizes a marketplace session: this app may then transact as you
          against the transaction service until the session expires or you sign out. The session stays on this device
          across tabs, reloads, and restarts.
        </Typography>
        <Typography as="p" className="text-sm text-muted-foreground">
          Ring will show an empty permission list — that is correct. This approval only proves your identity to the
          marketplace service; it grants no read or write access to anything on your homeserver.
        </Typography>

        {session.status === 'error' ? (
          <div className="grid gap-3">
            <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
              {session.errorMessage}
            </div>
            <Button className="w-fit rounded-full" onClick={session.start}>
              <RefreshCw className="mr-2 size-4" />
              Try again
            </Button>
          </div>
        ) : (
          <div className="grid justify-items-center gap-4">
            <button
              type="button"
              className="group relative flex size-48 cursor-pointer items-center justify-center rounded-md bg-foreground p-2"
              onClick={() => void copyUrl()}
              disabled={!session.authorizationUrl}
              aria-label="Copy authorization link"
            >
              <QrCodeSlot
                isLoading={session.status !== 'awaiting'}
                isExpired={false}
                url={session.authorizationUrl}
                generatingLabel="Generating QR Code..."
                clickToReloadLabel="Click to reload"
                activeQrHasHoverEffect
              />
            </button>

            {session.status === 'awaiting' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                <Loader2 className="size-4 animate-spin" />
                Waiting for approval on your signer…
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={session.openInRing}
                disabled={!session.authorizationUrl || session.isOpeningRing}
                aria-busy={session.isOpeningRing}
              >
                {session.isOpeningRing ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Smartphone className="mr-2 size-4" />
                )}
                {session.isOpeningRing ? 'Opening Pubky Ring...' : 'Open in Pubky Ring'}
              </Button>
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={() => void copyUrl()}
                disabled={!session.authorizationUrl}
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
