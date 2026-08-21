'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Controller } from 'react-hook-form';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceDisputeCase } from '@/hooks/useMarketplaceDisputeCase/useMarketplaceDisputeCase';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';
import { MarketplaceSessionRequiredCard } from './MarketplaceSessionRequiredCard';

/**
 * The dispute case file: the scoped evidence read plus, for moderators, the
 * resolve action. Evidence bodies render ONLY from
 * `GET /v1/orders/{id}/evidence` — order projections carry a content-free
 * count and must never be used as an evidence source.
 *
 * `canResolve` is not client configuration: it is true only when the caller
 * reached this dialog through the moderator dispute queue, i.e. after the
 * service accepted the 403-gated `GET /v1/disputes` read for this session.
 * Participants opening their own case file get the same full evidence view
 * (both parties see the whole file by service design) without the resolve
 * affordance.
 */
export function MarketplaceDisputeCaseDialog({
  orderId,
  canResolve,
  onChanged,
}: {
  orderId: string;
  canResolve: boolean;
  onChanged?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const disputeCase = useMarketplaceDisputeCase(orderId, open);
  const dispute = disputeCase.order?.dispute ?? null;

  const submitEvidence = async () => {
    if (await disputeCase.submitEvidence()) await onChanged?.();
  };

  const resolve = async () => {
    if (await disputeCase.resolve()) {
      await onChanged?.();
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="rounded-full">
          <FileText className="mr-2 size-4" />
          {canResolve ? 'Open case file' : 'View case file'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-popover">
        <DialogHeader>
          <DialogTitle>Dispute case file</DialogTitle>
        </DialogHeader>

        {canResolve ? (
          <Typography as="p" className="text-xs text-muted-foreground">
            Your access is logged: the service records every moderator case-file read — who read it, which order, and
            how many evidence items were served — in the same transaction as the read itself.
          </Typography>
        ) : (
          <Typography as="p" className="text-xs text-muted-foreground">
            Both dispute participants see the full case file. Moderator access to case files is recorded by the service.
          </Typography>
        )}

        {disputeCase.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : disputeCase.needsSession && disputeCase.error ? (
          <MarketplaceSessionRequiredCard message={disputeCase.error} onConnected={disputeCase.refresh} />
        ) : disputeCase.error ? (
          <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
            {disputeCase.error}
          </div>
        ) : disputeCase.order && dispute ? (
          <>
            <div className="grid gap-2 rounded-xl border p-4">
              <div className="flex flex-wrap gap-2">
                <Badge>{dispute.state === 'open' ? 'Dispute open' : 'Dispute resolved'}</Badge>
                <Badge variant="secondary">Requested {dispute.requestedRemedy.replaceAll('_', ' ')}</Badge>
                <Badge variant="outline">Order {disputeCase.order.state.replaceAll('_', ' ')}</Badge>
              </div>
              <Typography as="p" className="text-sm">
                {dispute.reason}
              </Typography>
              <Typography as="p" className="text-xs text-muted-foreground">
                Opened by {dispute.openedBy.slice(0, 8)}… on {new Date(dispute.openedAt).toLocaleString('en-US')}
              </Typography>
              {dispute.resolution && (
                <Typography as="p" className="text-sm">
                  Resolved as <span className="font-semibold">{dispute.resolution.replaceAll('_', ' ')}</span>
                  {dispute.rationale ? ` — ${dispute.rationale}` : ''}
                </Typography>
              )}
            </div>

            <div className="grid gap-2">
              <Typography as="p" className="font-semibold">
                Evidence
              </Typography>
              {disputeCase.caseFile?.evidence.length ? (
                <div className="grid gap-2">
                  {disputeCase.caseFile.evidence.map((item) => (
                    <div key={item.id} className="rounded-xl border p-3">
                      <Typography as="p" className="text-xs text-muted-foreground">
                        {item.submitterPubky.slice(0, 8)}… · {new Date(item.createdAt).toLocaleString('en-US')}
                      </Typography>
                      <Typography as="p" className="mt-1 text-sm whitespace-pre-wrap">
                        {item.body}
                      </Typography>
                    </div>
                  ))}
                </div>
              ) : (
                <Typography as="p" className="text-sm text-muted-foreground">
                  No evidence has been submitted for this dispute.
                </Typography>
              )}
            </div>

            {disputeCase.canSubmitEvidence && (
              <div className="grid gap-2">
                <ControlledTextareaField
                  name="body"
                  control={disputeCase.evidenceForm.control}
                  label="Submit evidence"
                  placeholder="State what happened, factually"
                />
                <Button className="w-fit rounded-full" onClick={() => void submitEvidence()}>
                  Add to case file
                </Button>
              </div>
            )}

            {canResolve && disputeCase.isDisputeOpen && (
              <div className="grid gap-3 rounded-xl border p-4">
                <Typography as="p" className="font-semibold">
                  Resolve this dispute
                </Typography>
                <Controller
                  name="resolution"
                  control={disputeCase.resolveForm.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-11 w-full border px-3" aria-label="Dispute resolution">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buyer_refund">Buyer refund</SelectItem>
                        <SelectItem value="partial_refund">Partial refund</SelectItem>
                        <SelectItem value="seller_favor">Seller favor</SelectItem>
                        <SelectItem value="replacement">Replacement</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <ControlledTextareaField
                  name="rationale"
                  control={disputeCase.resolveForm.control}
                  label="Rationale"
                  placeholder="Explain the decision for both parties"
                />
                <Typography as="p" className="text-xs text-muted-foreground">
                  Buyer refund and partial refund leave the order disputed until the seller records the external refund;
                  seller favor and replacement complete it. No funds move through this service.
                </Typography>
                <Button className="w-fit rounded-full" onClick={() => void resolve()}>
                  Record resolution
                </Button>
              </div>
            )}
          </>
        ) : null}

        <DialogFooter>
          <Button variant="secondary" className="rounded-full" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
