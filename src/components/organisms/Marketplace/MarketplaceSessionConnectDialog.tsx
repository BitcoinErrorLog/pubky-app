'use client';

import { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { useIsGrantSession } from '@/hooks/useIsGrantSession/useIsGrantSession';
import { useMarketplaceSessionConnect } from '@/hooks/useMarketplaceSessionConnect/useMarketplaceSessionConnect';
import { Logger } from '@/libs/logger/logger';
import { getMarketplaceGrantFlowEnabled } from '@/libs/runtime-config/runtime-config';
import { GrantSessionRefusal } from '@/molecules/GrantSessionRefusal/GrantSessionRefusal';
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
export function MarketplaceSessionConnectDialog({
  triggerLabel = 'Connect marketplace session',
  onConnected,
  autoOpen = false,
}: {
  triggerLabel?: string;
  onConnected?: () => void | Promise<void>;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const grantFlowEnabled = getMarketplaceGrantFlowEnabled();
  const session = useMarketplaceSessionConnect({
    onConnected: () => {
      toast({
        title: 'Purchases approved',
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
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  // A Bitkit (grant) sign-in has no AuthToken to redeem; it connects through
  // the grant bootstrap, so it is refused only where that flow is off.
  const refusesGrantSession = useIsGrantSession() && !grantFlowEnabled;
  useEffect(() => {
    if (open) {
      if (!refusesGrantSession) start();
      return;
    }
    cancel();
  }, [open, start, cancel, refusesGrantSession]);

  const copyUrl = async () => {
    try {
      await session.copyAuthUrl();
      toast({ variant: 'info', title: 'Authorization link copied' });
    } catch (error) {
      Logger.error('Failed to copy the marketplace authorization link', { error });
      toast({ variant: 'error', description: 'Could not copy to clipboard' });
    }
  };

  // Which consent is being requested is decided ONCE by the hook (it also
  // picks the flow `start()` begins) — never re-evaluate it here, or the
  // copy could describe a different approval than the QR requests.
  const requestsFullGrant = session.requestsFullGrant;
  const requestsGrantReconnect = session.requestsGrantReconnect;
  const requestsGrantBootstrap = session.requestsGrantBootstrap;

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
          <DialogTitle>
            {requestsGrantBootstrap
              ? 'Approve purchases in Bitkit'
              : requestsGrantReconnect
                ? 'Approve purchases'
                : 'Approve purchases in Pubky Ring'}
          </DialogTitle>
        </DialogHeader>

        <Typography as="p" className="text-sm text-muted-foreground">
          {requestsGrantBootstrap
            ? 'Approve with Bitkit to connect purchases for the identity signed in to Shop. Nothing is charged until you pay.'
            : requestsGrantReconnect
              ? 'Approve with Bitkit or Pubky Ring to reconnect the marketplace session for the identity already signed in to Shop. Nothing is charged until you pay.'
              : requestsFullGrant && !grantFlowEnabled
                ? 'Sign in to Pubky Shop.'
                : 'Approve purchases for this device.'}
        </Typography>

        {refusesGrantSession ? (
          <GrantSessionRefusal />
        ) : ['error', 'mismatch', 'expired', 'cancelled'].includes(session.status) ? (
          <div className="grid gap-3">
            <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
              {session.status === 'mismatch'
                ? 'That approval used a different identity. Approve with the same identity currently signed in to Shop.'
                : session.status === 'expired'
                  ? 'This approval expired.'
                  : session.status === 'cancelled'
                    ? 'Approval cancelled.'
                    : session.errorMessage}
            </div>
            <Button className="w-fit rounded-full" onClick={session.start}>
              <RefreshCw className="mr-2 size-4" />
              Try again
            </Button>
          </div>
        ) : session.status === 'joined' ? (
          // The approval lives on another surface (e.g. a sign-in in
          // progress), which holds the only scannable URL. No QR, Copy, or
          // Open here — approving there settles this session too.
          <div role="status" className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            An approval is already in progress on another surface. Approve it there — it also connects this marketplace
            session.
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
                showRingLogo={!requestsGrantBootstrap}
              />
            </button>

            {session.status === 'awaiting' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                {requestsGrantBootstrap ? 'Waiting for approval in Bitkit…' : 'Waiting for approval on your signer…'}
              </div>
            )}
            {['creating', 'verifying', 'claiming'].includes(session.status) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                {session.status === 'creating'
                  ? requestsGrantBootstrap
                    ? 'Confirming with your homeserver…'
                    : 'Preparing secure approval…'
                  : session.status === 'verifying'
                    ? 'Verifying approval…'
                    : 'Connecting marketplace…'}
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
                  <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Smartphone className="mr-2 size-4" />
                )}
                {session.isOpeningRing
                  ? requestsGrantBootstrap
                    ? 'Opening Bitkit...'
                    : requestsGrantReconnect
                      ? 'Opening signer...'
                      : 'Opening Pubky Ring...'
                  : requestsGrantBootstrap
                    ? 'Open in Bitkit'
                    : requestsGrantReconnect
                      ? 'Open in signer'
                      : 'Open in Pubky Ring'}
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
