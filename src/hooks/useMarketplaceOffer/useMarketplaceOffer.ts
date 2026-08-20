'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { CommerceController } from '@/controllers/commerce/commerce';
import { isMarketplaceRevisionConflict } from '@/libs/commerce/transaction-commands';
import { toast } from '@/molecules/Toaster/use-toast';
import {
  type MarketplaceOfferData,
  marketplaceOfferDefaults,
  marketplaceOfferSchema,
} from './useMarketplaceOffer.types';

export interface UseMarketplaceOfferResult {
  form: UseFormReturn<MarketplaceOfferData>;
  submit: () => Promise<boolean>;
  reset: () => void;
}

export function useMarketplaceOffer(
  aggregateId: string,
  expectedRevision: number | null,
  onConflict: () => void | Promise<void>,
): UseMarketplaceOfferResult {
  const form = useForm<MarketplaceOfferData>({
    resolver: zodResolver(marketplaceOfferSchema),
    defaultValues: marketplaceOfferDefaults,
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
          kind: 'offer.create',
          payload: {
            amount: { amountMinor: Math.round(Number(data.amount) * 100), currency: 'USD', exponent: 2 },
            quantity: Number(data.quantity),
            expiresInSeconds: 24 * 60 * 60,
            message: data.message,
          },
        });
        if (!response.ok) {
          if (isMarketplaceRevisionConflict(response)) {
            await onConflict();
            toast({
              variant: 'error',
              description: 'This listing changed since you loaded it. The latest terms were reloaded — offer again.',
            });
            return;
          }
          toast({ variant: 'error', description: response.error.message });
          return;
        }
        succeeded = true;
        toast({ title: 'Offer sent', description: 'The seller has 24 hours to respond.' });
      } catch {
        toast({ variant: 'error', description: 'Could not send this offer.' });
      }
    })();
    return succeeded;
  };

  const reset = () => form.reset(marketplaceOfferDefaults);
  return { form, submit, reset };
}
