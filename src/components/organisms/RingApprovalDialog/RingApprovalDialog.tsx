'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@synonymdev/pubky';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { PUBCHI_SIGNIN_CAPABILITIES } from '@/libs/pubchi/capabilities';
import { QrCodeSlot } from '@/molecules/QrCodeSlot/QrCodeSlot';
import type { TGenerateAuthUrlResult } from '@/services/homeserver/homeserver.types';

export const PUBCHI_RING_CAPABILITIES = PUBCHI_SIGNIN_CAPABILITIES;

type RingApprovalDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproved: (session: Session) => void | Promise<unknown>;
  capabilities?: string;
};

export function RingApprovalDialog({
  open,
  onOpenChange,
  onApproved,
  capabilities = PUBCHI_RING_CAPABILITIES,
}: RingApprovalDialogProps) {
  const [approval, setApproval] = useState<TGenerateAuthUrlResult>();
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let currentApproval: TGenerateAuthUrlResult | undefined;
    setLoading(true);
    setExpired(false);
    setApproval(undefined);
    void PubchiController.getCapabilityApprovalUrl()
      .then((nextApproval) => {
        currentApproval = nextApproval;
        if (!active) {
          nextApproval.cancelAuthFlow();
          return;
        }
        setApproval(nextApproval);
        nextApproval.awaitApproval
          .then(async (session) => {
            if (!active) return;
            await onApproved(session);
            if (active) onOpenChange(false);
          })
          .catch(() => {
            if (active) setExpired(true);
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      })
      .catch(() => {
        if (active) {
          setExpired(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
      currentApproval?.cancelAuthFlow();
    };
  }, [onApproved, onOpenChange, open]);

  const reload = () => {
    onOpenChange(false);
    setTimeout(() => onOpenChange(true), 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent centered className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Approve Pubchi in Pubky Ring</DialogTitle>
          <DialogDescription>
            Scan this QR code with Pubky Ring, or open the link below. This grants <code>{capabilities}</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="size-56 rounded-md bg-foreground p-2">
            <QrCodeSlot
              url={approval?.authorizationUrl ?? ''}
              isLoading={loading && !approval}
              isExpired={expired}
              generatingLabel="Generating approval QR…"
              clickToReloadLabel="Click to reload"
            />
          </div>
          {approval?.authorizationUrl ? (
            <Link href={approval.authorizationUrl} className="text-center underline" target="_blank" rel="noopener noreferrer">
              Open in Pubky Ring
            </Link>
          ) : null}
          {loading ? (
            <Typography size="sm" className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Waiting for approval…
            </Typography>
          ) : expired ? (
            <Button type="button" variant="secondary" onClick={reload}>
              <RefreshCw /> Generate a new request
            </Button>
          ) : null}
        </div>
        {expired ? <Typography size="sm" className="text-center text-muted-foreground">This Ring request timed out. Generate a new request to try again.</Typography> : null}
      </DialogContent>
    </Dialog>
  );
}
