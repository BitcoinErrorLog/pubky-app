'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { CommerceController } from '@/controllers/commerce/commerce';
import { buildMarketplaceReportAggregateId } from '@/libs/commerce/transaction-commands';
import { toast } from '@/molecules/Toaster/use-toast';
import {
  type MarketplaceReportData,
  marketplaceReportDefaults,
  marketplaceReportSchema,
} from './useMarketplaceReport.types';

export function useMarketplaceReport(targetId: string) {
  const form = useForm<MarketplaceReportData>({
    resolver: zodResolver(marketplaceReportSchema),
    defaultValues: marketplaceReportDefaults,
    mode: 'onChange',
  });

  const submit = async () => {
    let succeeded = false;
    await form.handleSubmit(async (data) => {
      const commandId = crypto.randomUUID();
      try {
        const response = await CommerceController.executeMarketplaceCommand({
          version: 1,
          commandId,
          aggregateId: buildMarketplaceReportAggregateId(commandId),
          expectedRevision: 0,
          issuedAt: new Date().toISOString(),
          kind: 'trust.report',
          payload: { targetType: 'listing', targetId, reason: data.reason, details: data.details },
        });
        if (!response.ok) {
          toast({ variant: 'error', description: response.error.message });
          return;
        }
        succeeded = true;
        form.reset(marketplaceReportDefaults);
        toast({ title: 'Report submitted', description: 'The listing was added to the moderation queue.' });
      } catch {
        toast({ variant: 'error', description: 'Could not submit this report.' });
      }
    })();
    return succeeded;
  };

  return { form, submit };
}
