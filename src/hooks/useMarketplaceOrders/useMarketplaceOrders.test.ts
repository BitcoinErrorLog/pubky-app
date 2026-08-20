import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceOrders } from './useMarketplaceOrders';

const BUYER = 'b'.repeat(52);
const SELLER = 'y'.repeat(52);
const PAYMENT_ID = '00000000-0000-4000-8000-000000001110';

const config = vi.hoisted(() => ({
  mode: 'sandbox' as string,
}));

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommercePollIntervalMs: () => 60_000, getCommerceAdapterMode: () => config.mode };
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: BUYER }),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getMarketplaceOrders: vi.fn(),
    getMarketplacePayment: vi.fn(),
    getMarketplaceReceipt: vi.fn(),
    executeMarketplaceCommand: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

describe('useMarketplaceOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.mode = 'sandbox';
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000001111');
    vi.mocked(CommerceController.getMarketplaceOrders).mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000001112',
        buyerPubky: BUYER,
        sellerPubky: SELLER,
        revision: 1,
        state: 'pending_payment',
        lines: [
          {
            listingAggregateId: `listing:${SELLER}_boots`,
            listingRevision: 1,
            contentHash: 'a'.repeat(64),
            title: 'Boots',
            quantity: 1,
            unitPrice: { amountMinor: 10_000, currency: 'USD', exponent: 2 },
            subtotal: { amountMinor: 10_000, currency: 'USD', exponent: 2 },
          },
        ],
        subtotal: { amountMinor: 10_000, currency: 'USD', exponent: 2 },
        shipping: { amountMinor: 1_200, currency: 'USD', exponent: 2 },
        tax: { amountMinor: 896, currency: 'USD', exponent: 2 },
        total: { amountMinor: 12_096, currency: 'USD', exponent: 2 },
        guaranteePolicyVersion: 1,
        paymentId: PAYMENT_ID,
        receiptId: null,
        createdAt: '2026-08-19T23:00:00.000Z',
        updatedAt: '2026-08-19T23:00:00.000Z',
      },
    ]);
    vi.mocked(CommerceController.getMarketplacePayment).mockResolvedValue({
      id: PAYMENT_ID,
      orderId: '00000000-0000-4000-8000-000000001112',
      buyerPubky: BUYER,
      sellerPubky: SELLER,
      revision: 1,
      adapter: 'sandbox',
      state: 'awaiting_entitlement',
      confirmations: 0,
      locksBundleId: '00000000-0000-4000-8000-000000001113',
      amount: { amountMinor: 12_096, currency: 'USD', exponent: 2 },
      createdAt: '2026-08-19T23:00:00.000Z',
      updatedAt: '2026-08-19T23:00:00.000Z',
    });
    vi.mocked(CommerceController.getMarketplaceReceipt).mockResolvedValue(null);
    vi.mocked(CommerceController.executeMarketplaceCommand).mockResolvedValue({
      ok: true,
      version: 1,
      commandId: '00000000-0000-4000-8000-000000001111',
      aggregateId: `payment:${PAYMENT_ID}`,
      revision: 2,
      eventIds: ['00000000-0000-4000-8000-000000001114'],
      result: { kind: 'payment' },
    });
  });

  it('loads participant order/payment views and advances sandbox confirmation', async () => {
    const { result } = renderHook(() => useMarketplaceOrders());
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
    const payment = result.current.orders[0].payment!;

    await act(() => result.current.advancePayment(payment, 'confirmed', 1));

    expect(CommerceController.executeMarketplaceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: `payment:${PAYMENT_ID}`,
        expectedRevision: 1,
        kind: 'payment.sandbox_advance',
        payload: { paymentId: PAYMENT_ID, target: 'confirmed', confirmations: 1 },
      }),
    );
  });

  it.each(['unavailable', 'locks-paykit'])('loads nothing and never queries projections in %s mode', async (mode) => {
    config.mode = mode;

    const { result } = renderHook(() => useMarketplaceOrders());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.orders).toHaveLength(0);
    expect(result.current.adapterMode).toBe(mode);
    expect(CommerceController.getMarketplaceOrders).not.toHaveBeenCalled();
    expect(CommerceController.getMarketplacePayment).not.toHaveBeenCalled();
  });

  it('loads durable orders from their embedded payment projection in transaction-service mode', async () => {
    config.mode = 'transaction-service';
    const [sandboxOrder] = await CommerceController.getMarketplaceOrders();
    vi.mocked(CommerceController.getMarketplaceOrders).mockResolvedValue([
      {
        ...sandboxOrder,
        // The durable read embeds the payment (without locksBundleId, per
        // ADR-0019 §8) instead of serving it from a separate endpoint.
        payment: {
          id: PAYMENT_ID,
          orderId: sandboxOrder.id,
          buyerPubky: BUYER,
          sellerPubky: SELLER,
          revision: 1,
          adapter: 'sandbox',
          state: 'awaiting_entitlement',
          confirmations: 0,
          amount: { amountMinor: 12_096, currency: 'USD', exponent: 2 },
          createdAt: '2026-08-19T23:00:00.000Z',
          updatedAt: '2026-08-19T23:00:00.000Z',
        },
      },
    ]);

    const { result } = renderHook(() => useMarketplaceOrders());
    await waitFor(() => expect(result.current.orders).toHaveLength(1));

    expect(result.current.orders[0].payment).toMatchObject({ id: PAYMENT_ID, state: 'awaiting_entitlement' });
    expect(CommerceController.getMarketplacePayment).not.toHaveBeenCalled();
    // receiptId is null until payment confirmation issues the receipt.
    expect(CommerceController.getMarketplaceReceipt).not.toHaveBeenCalled();
  });

  it('sources expected_revision from the loaded order and refetches on a revision conflict', async () => {
    const { result } = renderHook(() => useMarketplaceOrders());
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
    const order = result.current.orders[0].order;
    vi.mocked(CommerceController.executeMarketplaceCommand).mockResolvedValue({
      ok: false,
      error: { code: 'REVISION_CONFLICT', message: 'The aggregate changed.', currentRevision: 3 },
    });
    vi.mocked(CommerceController.getMarketplaceOrders).mockClear();

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.actOnOrder(order, 'fulfillment.confirm_delivery', {});
    });

    expect(succeeded).toBe(false);
    expect(CommerceController.executeMarketplaceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: `order:${order.id}`,
        expectedRevision: order.revision,
        kind: 'fulfillment.confirm_delivery',
      }),
    );
    // The conflict refetched the timeline so the retry starts from truth.
    expect(CommerceController.getMarketplaceOrders).toHaveBeenCalled();
    const { toast } = await import('@/molecules/Toaster/use-toast');
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('reloaded') }),
    );
  });

  it('refuses to advance a payment outside sandbox mode', async () => {
    const { result } = renderHook(() => useMarketplaceOrders());
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
    const payment = result.current.orders[0].payment!;

    config.mode = 'transaction-service';
    let advanced: boolean | undefined;
    await act(async () => {
      advanced = await result.current.advancePayment(payment, 'confirmed', 1);
    });

    expect(advanced).toBe(false);
    expect(CommerceController.executeMarketplaceCommand).not.toHaveBeenCalled();
  });
});
