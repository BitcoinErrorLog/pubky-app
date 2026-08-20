'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { MarketplaceCartItem } from '@/hooks/useMarketplaceCart/useMarketplaceCart';
import { buildMarketplaceCheckoutAggregateId } from '@/libs/commerce/transaction-commands';
import { toast } from '@/molecules/Toaster/use-toast';
import {
  type MarketplaceCheckoutData,
  marketplaceCheckoutDefaults,
  marketplaceCheckoutSchema,
} from './useMarketplaceCheckout.types';

export function useMarketplaceCheckout(
  items: MarketplaceCartItem[],
  clearCart: () => Promise<void>,
): {
  form: UseFormReturn<MarketplaceCheckoutData>;
  submit: () => Promise<boolean>;
} {
  const form = useForm<MarketplaceCheckoutData>({
    resolver: zodResolver(marketplaceCheckoutSchema),
    defaultValues: marketplaceCheckoutDefaults,
    mode: 'onChange',
  });

  const submit = async (): Promise<boolean> => {
    if (!items.length) return false;
    let succeeded = false;
    await form.handleSubmit(async (data) => {
      try {
        const lines = await Promise.all(
          items.map(async (item) => {
            const record = item.listing.record;
            const projection = await CommerceController.getMarketplaceListingProjection(
              record.ownerPubky,
              record.listingId,
            );
            if (!projection) return null;
            return {
              listingAggregateId: projection.aggregateId,
              expectedRevision: projection.serverRevision,
              quantity: item.quantity,
            };
          }),
        );
        if (lines.some((line) => line === null)) {
          toast({ variant: 'error', description: 'Cart terms could not be refreshed.' });
          return;
        }
        const commandId = crypto.randomUUID();
        const response = await CommerceController.executeMarketplaceCommand({
          version: 1,
          commandId,
          aggregateId: buildMarketplaceCheckoutAggregateId(commandId),
          expectedRevision: 0,
          issuedAt: new Date().toISOString(),
          kind: 'checkout.create',
          payload: {
            lines,
            deliveryAddress: {
              name: data.name,
              line1: data.line1,
              line2: data.line2,
              city: data.city,
              region: data.region,
              postalCode: data.postalCode,
              countryCode: data.countryCode.toUpperCase(),
            },
            guaranteePolicyVersion: 1,
          },
        });
        if (!response.ok) {
          toast({ variant: 'error', description: response.error.message });
          return;
        }
        await clearCart();
        succeeded = true;
        toast({ title: 'Order created', description: 'Complete the sandbox payment to continue.' });
      } catch {
        toast({ variant: 'error', description: 'Checkout could not be completed.' });
      }
    })();
    return succeeded;
  };

  return { form, submit };
}
