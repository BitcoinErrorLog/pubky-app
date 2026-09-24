import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createOrderFixture } from '@/test/fixtures/commerce/orders';
import { useMarketplaceOrderAction } from './useMarketplaceOrderAction';

describe('useMarketplaceOrderAction ship action', () => {
  it('sends the curated carrier by its canonical display name', async () => {
    const order = createOrderFixture('paid');
    const actOnOrder = vi.fn(async () => true);
    const { result } = renderHook(() => useMarketplaceOrderAction(order, actOnOrder));

    act(() => {
      result.current.setAction('ship', { carrierChoice: 'royal-mail', trackingNumber: 'RN123456785GB' });
    });
    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.submit();
    });

    expect(succeeded).toBe(true);
    expect(actOnOrder).toHaveBeenCalledWith(order, 'fulfillment.ship', {
      carrier: 'Royal Mail',
      trackingNumber: 'RN123456785GB',
    });
  });

  it('passes an "Other" carrier through as the seller\'s own free text', async () => {
    const order = createOrderFixture('paid');
    const actOnOrder = vi.fn(async () => true);
    const { result } = renderHook(() => useMarketplaceOrderAction(order, actOnOrder));

    act(() => {
      result.current.setAction('ship', {
        carrierChoice: 'other',
        carrier: 'Correio da Aldeia',
        trackingNumber: 'CA-0001',
      });
    });
    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.submit();
    });

    expect(succeeded).toBe(true);
    expect(actOnOrder).toHaveBeenCalledWith(order, 'fulfillment.ship', {
      carrier: 'Correio da Aldeia',
      trackingNumber: 'CA-0001',
    });
  });

  it('refuses to ship without a tracking number or an unnamed Other carrier', async () => {
    const order = createOrderFixture('paid');
    const actOnOrder = vi.fn(async () => true);
    const { result } = renderHook(() => useMarketplaceOrderAction(order, actOnOrder));

    act(() => {
      result.current.setAction('ship', { carrierChoice: 'usps', trackingNumber: '' });
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(actOnOrder).not.toHaveBeenCalled();

    act(() => {
      result.current.setAction('ship', { carrierChoice: 'other', carrier: '', trackingNumber: 'X-1' });
    });
    await act(async () => {
      await result.current.submit();
    });
    expect(actOnOrder).not.toHaveBeenCalled();
  });
});

describe('useMarketplaceOrderAction refund', () => {
  const paypalOrder = createOrderFixture('return_received', {
    paymentMethod: 'paypal',
    total: { amountMinor: 250, currency: 'USD', exponent: 2 },
  });

  it('prefills the order total and records a smaller PayPal refund', async () => {
    const actOnOrder = vi.fn(async () => true);
    const { result } = renderHook(() => useMarketplaceOrderAction(paypalOrder, actOnOrder));

    act(() => {
      result.current.setAction('refund');
    });
    expect(result.current.form.getValues('amount')).toBe('2.50');

    act(() => {
      result.current.form.setValue('amount', '1.89');
      result.current.form.setValue('transactionId', 'PAYPALREFUND189');
    });
    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.submit();
    });

    expect(succeeded).toBe(true);
    expect(actOnOrder).toHaveBeenCalledWith(paypalOrder, 'refund.record_external', {
      amountMinor: 189,
      transactionId: 'PAYPALREFUND189',
    });
  });

  it('refuses a refund above the order total', async () => {
    const actOnOrder = vi.fn(async () => true);
    const { result } = renderHook(() => useMarketplaceOrderAction(paypalOrder, actOnOrder));

    act(() => {
      result.current.setAction('refund', { amount: '2.51', transactionId: 'PAYPALREFUND251' });
    });
    await act(async () => {
      await result.current.submit();
    });

    expect(actOnOrder).not.toHaveBeenCalled();
    expect(result.current.form.getFieldState('amount').error?.message).toBe('Enter a refund up to the order total.');
  });
});
