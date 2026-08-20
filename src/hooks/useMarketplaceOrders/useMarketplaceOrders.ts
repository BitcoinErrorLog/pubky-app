'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { getCommerceAdapterMode, getCommercePollIntervalMs } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { buildMarketplacePaymentAggregateId } from '@/libs/commerce/transaction-commands';
import { buildMarketplaceOrderAggregateId } from '@/libs/commerce/transaction-commands';
import { toast } from '@/molecules/Toaster/use-toast';
import type { MarketplaceOrder, MarketplacePayment, MarketplaceReceipt } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';

export interface MarketplaceOrderView {
  order: MarketplaceOrder;
  payment: MarketplacePayment | null;
  receipt: MarketplaceReceipt | null;
}

/**
 * Order timelines are a SANDBOX-ONLY surface: the order/payment/receipt query
 * projections exist only on the in-memory sandbox service, and the
 * `payment.sandbox_advance` simulate affordance must never be reachable
 * against the durable transaction service. In any other adapter mode this hook
 * loads nothing and refuses to advance payments.
 */
export function useMarketplaceOrders() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const adapterMode = getCommerceAdapterMode();
  const isSandbox = adapterMode === 'sandbox';
  const [orders, setOrders] = useState<MarketplaceOrderView[]>([]);
  const [isLoading, setIsLoading] = useState(isSandbox && Boolean(currentUserPubky));
  const [error, setError] = useState<string | null>(null);

  const refresh = () => loadOrders(currentUserPubky, setOrders, setIsLoading, setError);

  useEffect(() => {
    if (!currentUserPubky || !isSandbox) {
      setIsLoading(false);
      return;
    }
    let active = true;
    void loadOrders(currentUserPubky, setOrders, setIsLoading, setError);
    const timer = window.setInterval(() => {
      if (active) void loadOrders(currentUserPubky, setOrders, setIsLoading, setError);
    }, getCommercePollIntervalMs());
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [currentUserPubky, isSandbox]);

  const advancePayment = async (
    payment: MarketplacePayment,
    target: 'detected' | 'confirmed' | 'expired' | 'manual_review',
    confirmations: number,
  ) => {
    // Re-checked at call time: the render-time flag can go stale if the mode changes.
    if (getCommerceAdapterMode() !== 'sandbox') {
      toast({ variant: 'error', description: 'Simulated payments only exist on the sandbox service.' });
      return false;
    }
    try {
      const response = await CommerceController.executeMarketplaceCommand({
        version: 1,
        commandId: crypto.randomUUID(),
        aggregateId: buildMarketplacePaymentAggregateId(payment.id),
        expectedRevision: payment.revision,
        issuedAt: new Date().toISOString(),
        kind: 'payment.sandbox_advance',
        payload: { paymentId: payment.id, target, confirmations },
      });
      if (!response.ok) {
        toast({ variant: 'error', description: response.error.message });
        return false;
      }
      await refresh();
      return true;
    } catch {
      toast({ variant: 'error', description: 'Could not advance the sandbox payment.' });
      return false;
    }
  };

  const actOnOrder = async (order: MarketplaceOrder, kind: string, payload: Record<string, unknown>) => {
    try {
      const response = await CommerceController.executeMarketplaceCommand({
        version: 1,
        commandId: crypto.randomUUID(),
        aggregateId: buildMarketplaceOrderAggregateId(order.id),
        expectedRevision: order.revision,
        issuedAt: new Date().toISOString(),
        kind,
        payload: { orderId: order.id, ...payload },
      });
      if (!response.ok) {
        toast({ variant: 'error', description: response.error.message });
        return false;
      }
      await refresh();
      return true;
    } catch {
      toast({ variant: 'error', description: 'Could not update this order.' });
      return false;
    }
  };

  return { orders, isLoading, error, refresh, advancePayment, actOnOrder, adapterMode };
}

async function loadOrders(
  currentUserPubky: string | null,
  setOrders: Dispatch<SetStateAction<MarketplaceOrderView[]>>,
  setIsLoading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | null>>,
): Promise<void> {
  if (!currentUserPubky || getCommerceAdapterMode() !== 'sandbox') return;
  try {
    const orders = await CommerceController.getMarketplaceOrders();
    const views = await Promise.all(
      orders.map(async (order) => {
        const payment = await CommerceController.getMarketplacePayment(order.paymentId);
        const receipt = order.receiptId ? await CommerceController.getMarketplaceReceipt(order.receiptId) : null;
        return { order, payment, receipt };
      }),
    );
    setOrders(views);
    setError(null);
  } catch {
    setError('Marketplace orders are unavailable.');
  } finally {
    setIsLoading(false);
  }
}
