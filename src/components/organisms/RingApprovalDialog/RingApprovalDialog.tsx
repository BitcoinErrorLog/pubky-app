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
import { toast } from '@/molecules/Toaster/toast';
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
  const [adoptionError, setAdoptionError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let currentApproval: TGenerateAuthUrlResult | undefined;
    setLoading(true);
    setExpired(false);
    setAdoptionError(false);
    setApproval(undefined);
    void PubchiController.getCapabilityApprovalUrl(capabilities)
      .then((nextApproval) => {
        currentApproval = nextApproval;
        if (!active) {
          nextApproval.cancelAuthFlow();
          return;
        }
        setApproval(nextApproval);
        nextApproval.awaitApproval
          .then(async (session) => {
            try {
              const result = await onApproved(session);
              if (result === false) throw new Error('Ring approval adoption failed');
              toast({ variant: 'default', title: 'Ring approval applied', dismissButton: true });
              if (active) onOpenChange(false);
            } catch {
              setAdoptionError(true);
            }
          })
          .catch(() => {
            setExpired(true);
          })
          .finally(() => {
            setLoading(false);
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
  }, [capabilities, onApproved, onOpenChange, open]);

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
          ) : adoptionError ? (
            <Typography size="sm" className="text-center text-destructive">
              Could not apply the Ring approval. Keep this dialog open and try again.
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
