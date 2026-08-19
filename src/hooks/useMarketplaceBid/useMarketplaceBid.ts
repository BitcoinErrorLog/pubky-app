'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { CommerceController } from '@/controllers/commerce/commerce';
import { toast } from '@/molecules/Toaster/use-toast';
import { type MarketplaceBidData, marketplaceBidDefaults, marketplaceBidSchema } from './useMarketplaceBid.types';

export interface UseMarketplaceBidResult {
  form: UseFormReturn<MarketplaceBidData>;
  submit: () => Promise<boolean>;
  reset: () => void;
}

export function useMarketplaceBid(aggregateId: string, expectedRevision: number | null): UseMarketplaceBidResult {
  const form = useForm<MarketplaceBidData>({
    resolver: zodResolver(marketplaceBidSchema),
    defaultValues: marketplaceBidDefaults,
    mode: 'onChange',
  });

  const submit = async (): Promise<boolean> => {
    if (expectedRevision === null) return false;
    let succeeded = false;
    await form.handleSubmit(async (data) => {
      try {
        const response = await CommerceController.executeMarketplaceCommand({
          version: 1,
          commandId: crypto.randomUUID(),
          aggregateId,
          expectedRevision,
          issuedAt: new Date().toISOString(),
          kind: 'auction.place_bid',
          payload: {
            maximumAmount: {
              amountMinor: Math.round(Number(data.maximumAmount) * 100),
              currency: 'USD',
              exponent: 2,
            },
          },
        });
        if (!response.ok) {
          toast({ variant: 'error', description: response.error.message });
          return;
        }
        succeeded = true;
        toast({ title: 'Bid accepted', description: 'Your private proxy maximum is active.' });
      } catch {
        toast({ variant: 'error', description: 'Could not place this bid.' });
      }
    })();
    return succeeded;
  };

  const reset = () => form.reset(marketplaceBidDefaults);
  return { form, submit, reset };
}
