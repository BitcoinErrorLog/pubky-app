'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { getCommerceAdapterMode, getCommercePollIntervalMs, isTransactionalCommerceMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { buildMarketplacePaymentAggregateId } from '@/libs/commerce/transaction-commands';
import { buildMarketplaceOrderAggregateId, isMarketplaceRevisionConflict } from '@/libs/commerce/transaction-commands';
import { toast } from '@/molecules/Toaster/use-toast';
import type { MarketplaceOrder, MarketplacePayment, MarketplaceReceipt } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';

export interface MarketplaceOrderView {
  order: MarketplaceOrder;
  payment: MarketplacePayment | null;
  receipt: MarketplaceReceipt | null;
}

/**
 * Order timelines against whichever transactional backend the mode selects:
 * the in-memory sandbox or the durable transaction service. Post-purchase
 * commands source `expected_revision` from the freshly-loaded order, and a
 * `REVISION_CONFLICT` refetches the timeline and asks the user to retry
 * against what actually changed.
 *
 * `payment.sandbox_advance` remains SANDBOX-ONLY: the durable service still
 * models payments with its sandbox adapter (no funds move anywhere), and this
 * client refuses to simulate payment progress against the authority — so in
 * `transaction-service` mode a payment can only advance if some other actor
 * (e.g. a test harness) drives it.
 */
export function useMarketplaceOrders() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const adapterMode = getCommerceAdapterMode();
  const isTransactional = isTransactionalCommerceMode(adapterMode);
  const [orders, setOrders] = useState<MarketplaceOrderView[]>([]);
  const [isLoading, setIsLoading] = useState(isTransactional && Boolean(currentUserPubky));
  const [error, setError] = useState<string | null>(null);

  const refresh = () => loadOrders(currentUserPubky, setOrders, setIsLoading, setError);

  useEffect(() => {
    if (!currentUserPubky || !isTransactional) {
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
  }, [currentUserPubky, isTransactional]);

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
        if (isMarketplaceRevisionConflict(response)) {
          await refresh();
          toast({
            variant: 'error',
            description: 'This payment changed since you loaded it. The latest state was reloaded — retry from there.',
          });
          return false;
        }
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
        if (isMarketplaceRevisionConflict(response)) {
          await refresh();
          toast({
            variant: 'error',
            description: 'This order changed since you loaded it. The latest state was reloaded — retry from there.',
          });
          return false;
        }
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
  if (!currentUserPubky || !isTransactionalCommerceMode(getCommerceAdapterMode())) return;
  try {
    const orders = await CommerceController.getMarketplaceOrders();
    const views = await Promise.all(
      orders.map(async (order) => {
        // The durable service embeds the payment projection in the order
        // read; the sandbox serves it from its own endpoint.
        const payment = order.payment ?? (await CommerceController.getMarketplacePayment(order.paymentId));
        const receipt = order.receiptId ? await CommerceController.getMarketplaceReceipt(order.receiptId) : null;
        return { order, payment, receipt };
      }),
    );
    setOrders(views);
    setError(null);
  } catch (loadError) {
    // A missing/expired marketplace session carries actionable guidance
    // (approve the connection on your signer) — surface it instead of a
    // generic failure.
    setError(
      loadError instanceof Error && loadError.name === 'AppError'
        ? loadError.message
        : 'Marketplace orders are unavailable.',
    );
  } finally {
    setIsLoading(false);
  }
}
