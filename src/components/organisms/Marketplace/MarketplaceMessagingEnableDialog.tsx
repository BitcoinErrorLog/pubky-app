'use client';

import { useEffect, useState } from 'react';
import { Copy, Loader2, LockKeyhole, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceMessagingEnable } from '@/hooks/useMarketplaceMessagingEnable/useMarketplaceMessagingEnable';
import { PAYKIT_MESSAGING_CAPABILITY } from '@/libs/commerce/messaging-contracts';
import { Logger } from '@/libs/logger/logger';
import { QrCodeSlot } from '@/molecules/QrCodeSlot/QrCodeSlot';
import { toast } from '@/molecules/Toaster/use-toast';

/**
 * The in-dialog UX for the encrypted-messaging Ring grant. Mirrors the
 * marketplace session-connect precedent: the `pubkyauth://` authorization URL
 * renders as a QR for a cross-device Pubky Ring scan, plus a deeplink/copy
 * affordance for same-device Ring. Every mount starts a FRESH flow and
 * unmount cancels it.
 *
 * `reconnect` switches the copy for the returning case: the receiver key
 * already exists on this device, but the messaging session could not be
 * restored (it expired, was revoked, or this is a new tab — sessions restore
 * automatically only within the tab that created them), so a new approval is
 * needed to send or receive.
 */
export function MarketplaceMessagingEnablePanel({
  reconnect,
  onEnabled,
}: {
  reconnect: boolean;
  onEnabled?: () => void | Promise<void>;
}) {
  const enable = useMarketplaceMessagingEnable({
    onEnabled: () => {
      toast({
        title: reconnect ? 'Encrypted messaging reconnected' : 'Encrypted messaging enabled',
        description: 'The session stays active in this tab, survives reloads, and ends when the tab closes.',
      });
      void onEnabled?.();
    },
  });

  const { start, cancel } = enable;
  useEffect(() => {
    start();
    return cancel;
  }, [start, cancel]);

  const copyUrl = async () => {
    try {
      await enable.copyAuthUrl();
      toast({ variant: 'info', title: 'Authorization link copied' });
    } catch (error) {
      Logger.error('Failed to copy the messaging authorization link', { error });
      toast({ variant: 'error', description: 'Could not copy to clipboard' });
    }
  };

  return (
    <div className="grid gap-4">
      <Typography as="p" className="text-sm text-muted-foreground">
        Approving with your signer (Pubky Ring) grants this app a homeserver session scoped to{' '}
        <code className="rounded bg-secondary px-1 py-0.5 text-xs">{PAYKIT_MESSAGING_CAPABILITY}</code> — the Paykit
        tree where encrypted-message data lives. Your identity key never enters this browser; message encryption uses a
        separate key generated and kept on this device. The session belongs to this tab: it survives page reloads but
        ends when the tab closes, and other tabs need their own approval.
      </Typography>

      {enable.status === 'error' ? (
        <div className="grid gap-3">
          <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
            {enable.errorMessage}
          </div>
          <Button className="w-fit rounded-full" onClick={enable.start}>
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
            disabled={!enable.authorizationUrl}
            aria-label="Copy authorization link"
          >
            <QrCodeSlot
              isLoading={enable.status !== 'awaiting' || !enable.authorizationUrl}
              isExpired={false}
              url={enable.authorizationUrl}
              generatingLabel="Generating QR Code..."
              clickToReloadLabel="Click to reload"
              activeQrHasHoverEffect
            />
          </button>

          {enable.status === 'awaiting' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="size-4 animate-spin" />
              Waiting for approval on your signer…
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="secondary"
              className="rounded-full"
              onClick={enable.openInRing}
              disabled={!enable.authorizationUrl || enable.isOpeningRing}
              aria-busy={enable.isOpeningRing}
            >
              {enable.isOpeningRing ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Smartphone className="mr-2 size-4" />
              )}
              {enable.isOpeningRing ? 'Opening Pubky Ring...' : 'Open in Pubky Ring'}
            </Button>
            <Button
              variant="ghost"
              className="rounded-full"
              onClick={() => void copyUrl()}
              disabled={!enable.authorizationUrl}
            >
              <Copy className="mr-2 size-4" />
              Copy link
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Standalone trigger + dialog wrapper around the enable panel (inbox CTA). */
export function MarketplaceMessagingEnableDialog({
  reconnect,
  onEnabled,
}: {
  reconnect: boolean;
  onEnabled?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full">
          <LockKeyhole className="mr-2 size-4" />
          {reconnect ? 'Reconnect encrypted messaging' : 'Enable encrypted messaging'}
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-popover">
        <DialogHeader>
          <DialogTitle>{reconnect ? 'Reconnect encrypted messaging' : 'Enable encrypted messaging'}</DialogTitle>
        </DialogHeader>
        {open && (
          <MarketplaceMessagingEnablePanel
            reconnect={reconnect}
            onEnabled={async () => {
              setOpen(false);
              await onEnabled?.();
            }}
          />
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
