'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { MarketplaceOrder } from '@/services/marketplace/marketplace';
import {
  type MarketplaceOrderActionData,
  marketplaceOrderActionDefaults,
  marketplaceOrderActionSchema,
} from './useMarketplaceOrderAction.types';

export function useMarketplaceOrderAction(
  order: MarketplaceOrder,
  actOnOrder: (order: MarketplaceOrder, kind: string, payload: Record<string, unknown>) => Promise<boolean>,
) {
  const form = useForm<MarketplaceOrderActionData>({
    resolver: zodResolver(marketplaceOrderActionSchema),
    defaultValues: marketplaceOrderActionDefaults,
    mode: 'onChange',
  });

  const setAction = (action: MarketplaceOrderActionData['action']) => {
    form.reset({ ...marketplaceOrderActionDefaults, action, amount: (order.total.amountMinor / 100).toFixed(2) });
  };

  const submit = async (): Promise<boolean> => {
    let succeeded = false;
    await form.handleSubmit(async (data) => {
      switch (data.action) {
        case 'cancel':
          succeeded = await actOnOrder(order, 'order.cancel_request', { reason: data.reason });
          break;
        case 'ship':
          succeeded = await actOnOrder(order, 'fulfillment.ship', {
            carrier: data.carrier,
            trackingNumber: data.trackingNumber,
          });
          break;
        case 'return':
          succeeded = await actOnOrder(order, 'return.request', {
            reason: data.reason,
            requestedAmountMinor: Math.round(Number(data.amount) * 100),
          });
          break;
        case 'refund':
          succeeded = await actOnOrder(order, 'refund.record_external', {
            amountMinor: Math.round(Number(data.amount) * 100),
            transactionId: data.transactionId,
          });
          break;
        case 'dispute':
          succeeded = await actOnOrder(order, 'dispute.open', {
            reason: data.reason,
            requestedRemedy: data.requestedRemedy,
          });
          break;
        case 'review':
          succeeded = await actOnOrder(order, 'review.create', {
            rating: Number(data.rating),
            text: data.text,
          });
          break;
      }
    })();
    return succeeded;
  };

  return { form, setAction, submit };
}
