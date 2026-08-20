'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Controller } from 'react-hook-form';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { useMarketplaceReport } from '@/hooks/useMarketplaceReport/useMarketplaceReport';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';

export function MarketplaceReportDialog({ targetId }: { targetId: string }) {
  const [open, setOpen] = useState(false);
  const { requireAuth } = useRequireAuth();
  const report = useMarketplaceReport(targetId);

  const submit = async () => {
    if (await report.submit()) setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false);
          return;
        }
        requireAuth(() => setOpen(true));
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="rounded-full">
          <Flag className="mr-2 size-4" />
          Report listing
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-popover">
        <DialogHeader>
          <DialogTitle>Report this listing</DialogTitle>
        </DialogHeader>
        <Controller
          name="reason"
          control={report.form.control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="h-11 w-full border px-3" aria-label="Report reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prohibited_item">Prohibited item</SelectItem>
                <SelectItem value="counterfeit">Counterfeit</SelectItem>
                <SelectItem value="scam">Scam</SelectItem>
                <SelectItem value="unsafe">Unsafe</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <ControlledTextareaField
          name="details"
          control={report.form.control}
          label="Details"
          placeholder="Describe the policy or safety concern"
        />
        <DialogFooter>
          <Button variant="secondary" className="rounded-full" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={submit}>
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
