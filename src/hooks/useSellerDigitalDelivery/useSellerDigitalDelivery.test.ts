import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { createOrderFixture } from '@/test/fixtures/commerce/orders';
import { useSellerDigitalDelivery } from './useSellerDigitalDelivery';

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    fetchOrderDeliveryEmail: vi.fn(),
    fetchOrderDigitalEvidence: vi.fn(),
    commitDeliverDigital: vi.fn(),
  },
}));

const base = createOrderFixture('paid');
const order = createOrderFixture('paid', {
  fulfillment: 'digital',
  revision: 6,
  lines: [
    { ...base.lines[0], fulfillment: 'digital', digitalKind: 'email' },
    { ...base.lines[0], fulfillment: 'digital', digitalKind: 'message' },
  ],
});
const ok = {
  ok: true as const,
  version: 1 as const,
  commandId: '018f47d2-6a27-7c23-a62f-000000000941',
  aggregateId: `order:${order.id}`,
  revision: 7,
  eventIds: [],
  result: { kind: 'order' as const },
};
const readRefusal = (refusal: string) =>
  Err.client(ClientErrorCode.CONFLICT, 'static copy', {
    service: ErrorService.Marketplace,
    operation: 'getOrderDeliveryEmail',
    context: { statusCode: 409, refusal },
  });

describe('useSellerDigitalDelivery (digital delivery design §4.3, §6 F6–F8, F13–F15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CommerceController.fetchOrderDeliveryEmail).mockResolvedValue({
      orderId: order.id,
      deliveryEmail: 'buyer@example.com',
      emailedAt: null,
    });
    vi.mocked(CommerceController.commitDeliverDigital).mockResolvedValue(ok);
    vi.mocked(CommerceController.fetchOrderDigitalEvidence).mockResolvedValue({
      orderId: order.id,
      deliveredAt: null,
      firstOpenedAt: null,
      openCount: 0,
      emailedAt: null,
      messageDeliveredAt: null,
    });
  });

  it('reads the delivery evidence on a paid order and again after a mark (§3 "Seller\u2019s orders")', async () => {
    const { result } = renderHook(() => useSellerDigitalDelivery(order));
    await waitFor(() => expect(result.current.evidence).toEqual([]));

    vi.mocked(CommerceController.fetchOrderDigitalEvidence).mockResolvedValue({
      orderId: order.id,
      deliveredAt: null,
      firstOpenedAt: null,
      openCount: 0,
      emailedAt: '2026-09-26T13:05:00.000Z',
      messageDeliveredAt: null,
    });
    await act(async () => {
      await result.current.mark('email');
    });

    await waitFor(() => expect(result.current.evidence).toEqual([expect.stringMatching(/^Marked emailed Sep 26, /)]));
    expect(CommerceController.fetchOrderDigitalEvidence).toHaveBeenCalledTimes(2);
  });

  it('reads no evidence before payment', () => {
    renderHook(() => useSellerDigitalDelivery({ ...order, state: 'pending_payment', receiptId: null }));

    expect(CommerceController.fetchOrderDigitalEvidence).not.toHaveBeenCalled();
  });

  it('knows which manual channels the order needs, and reads no email until asked', () => {
    const { result } = renderHook(() => useSellerDigitalDelivery(order));

    expect(result.current.channels).toEqual(['email', 'message']);
    expect(result.current.email).toEqual({ status: 'hidden' });
    expect(CommerceController.fetchOrderDeliveryEmail).not.toHaveBeenCalled();
  });

  it('shows the buyer email on request and hides it again (F6)', async () => {
    const { result } = renderHook(() => useSellerDigitalDelivery(order));

    await act(async () => {
      await result.current.showEmail();
    });
    expect(result.current.email).toEqual({
      status: 'shown',
      email: { orderId: order.id, deliveryEmail: 'buyer@example.com', emailedAt: null },
    });
    act(() => result.current.hideEmail());
    expect(result.current.email).toEqual({ status: 'hidden' });
  });

  it.each([
    ['not_paid', "The buyer's email appears once payment is confirmed."],
    ['delivery_ended', 'This order was cancelled or refunded.'],
    ['email_missing', "Waiting for the buyer's email."],
  ])('names a %s refusal (F7–F9)', async (refusal, message) => {
    vi.mocked(CommerceController.fetchOrderDeliveryEmail).mockRejectedValue(readRefusal(refusal));
    const { result } = renderHook(() => useSellerDigitalDelivery(order));

    await act(async () => {
      await result.current.showEmail();
    });

    expect(result.current.email).toEqual({ status: 'refused', message });
  });

  it('marks emailed with the order revision, drops the address and reloads (F13)', async () => {
    const onChanged = vi.fn();
    const { result } = renderHook(() => useSellerDigitalDelivery(order, onChanged));
    await act(async () => {
      await result.current.showEmail();
    });

    await act(async () => {
      await result.current.mark('email');
    });

    expect(CommerceController.commitDeliverDigital).toHaveBeenCalledWith(order.id, 6, 'email');
    expect(result.current.message).toBe('Marked emailed. The buyer has been told to check their inbox.');
    expect(result.current.email).toEqual({ status: 'hidden' });
    expect(onChanged).toHaveBeenCalled();
  });

  it('names a cancel request and a lost race in plain words (F14, F15)', async () => {
    const onChanged = vi.fn();
    vi.mocked(CommerceController.commitDeliverDigital).mockResolvedValueOnce({
      ok: false,
      error: { code: 'INVALID_STATE', message: 'service words' },
    } as never);
    const cancelRequested: typeof order = { ...order, state: 'cancel_requested' };
    const { result, rerender } = renderHook(({ current }) => useSellerDigitalDelivery(current, onChanged), {
      initialProps: { current: cancelRequested },
    });

    await act(async () => {
      await result.current.mark('message');
    });
    expect(result.current.message).toBe('This order has a cancellation request. Approve or decline it first.');
    expect(onChanged).not.toHaveBeenCalled();

    vi.mocked(CommerceController.commitDeliverDigital).mockResolvedValueOnce({
      ok: false,
      error: { code: 'REVISION_CONFLICT', message: 'service words' },
    } as never);
    rerender({ current: order });
    await act(async () => {
      await result.current.mark('email');
    });
    expect(result.current.message).toBe('This order changed. Refresh to see the latest.');
    expect(onChanged).toHaveBeenCalled();
  });
});
