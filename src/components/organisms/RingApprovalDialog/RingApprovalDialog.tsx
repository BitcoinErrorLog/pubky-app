'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { Session } from '@synonymdev/pubky';
import { Copy, Key, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { PUBCHI_SIGNIN_CAPABILITIES } from '@/libs/pubchi/capabilities';
import { copyToClipboard } from '@/libs/utils/utils';
import { BalancedQrCard } from '@/molecules/BalancedQrCard/BalancedQrCard';
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
  const approvalRef = useRef<TGenerateAuthUrlResult | undefined>(undefined);

  const cancel = () => {
    approvalRef.current?.cancelAuthFlow();
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    approvalRef.current = undefined;
    setLoading(true);
    setExpired(false);
    setAdoptionError(false);
    setApproval(undefined);
    void PubchiController.getCapabilityApprovalUrl(capabilities)
      .then((nextApproval) => {
        approvalRef.current = nextApproval;
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
              toast({ variant: 'error', title: 'Could not apply Ring approval', dismissButton: true });
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
      approvalRef.current?.cancelAuthFlow();
      approvalRef.current = undefined;
    };
  }, [capabilities, onApproved, onOpenChange, open]);

  const reload = () => {
    onOpenChange(false);
    setTimeout(() => onOpenChange(true), 0);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : cancel())}>
      <DialogContent centered className="w-full max-w-md" data-testid="pubchi-reapprove-dialog">
        <DialogHeader>
          <DialogTitle>Approve Pubchi in Ring</DialogTitle>
          <DialogDescription>
            Your sign-in predates Pubchi. Scan with Pubky Ring to grant the Pubchi folders (
            <code>/pub/app.pubchi/v1/</code> and <code>/priv/app.pubchi/v1/</code>). Nothing else changes.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <BalancedQrCard
            data-testid="pubchi-reapprove-qr"
            className="border-0 p-0 shadow-none"
            illustration={
              <Image
                priority
                src="/images/scan.webp"
                alt="Pubky Ring phone scanning a QR code"
                width={192}
                height={192}
                className="size-48"
              />
            }
          >
            <div className="relative flex size-48 items-center justify-center rounded-md bg-foreground p-2">
              <QrCodeSlot
                url={approval?.authorizationUrl ?? ''}
                isLoading={loading && !approval}
                isExpired={expired}
                generatingLabel="Generating approval QR…"
                clickToReloadLabel="Click to reload"
                expiredReloadAction={{ onClick: reload, ariaLabel: 'Reload approval QR code' }}
              />
            </div>
          </BalancedQrCard>
          {approval?.authorizationUrl ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void copyToClipboard({ text: approval.authorizationUrl }).then(
                    () => toast({ variant: 'info', title: 'Authentication link copied' }),
                    () => toast({ variant: 'error', title: 'Could not copy to clipboard' }),
                  );
                }}
                aria-label="Copy authentication link"
              >
                <Copy /> Copy authentication link
              </Button>
              <Button asChild type="button">
                <Link href={approval.authorizationUrl} target="_blank" rel="noopener noreferrer">
                  <Key /> Authorize with Pubky Ring
                </Link>
              </Button>
            </div>
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
        {expired ? (
          <Typography size="sm" className="text-center text-muted-foreground">
            This Ring request timed out. Generate a new request to try again.
          </Typography>
        ) : null}
        <Button type="button" variant="secondary" data-testid="pubchi-reapprove-cancel" onClick={cancel}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
