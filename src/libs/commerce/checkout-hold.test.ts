import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_HOLD_COPY,
  formatHoldDeadline,
  holderBoundCopy,
  holderUnboundCopy,
  isHoldExpiredNoLateMoney,
  isLateCompletionOrder,
  isRefundRequiredPayment,
  PAYMENT_WINDOW_ELAPSED_REASON,
  refundRequiredCopyForRole,
  refundRequiredSellerCopy,
  UNBOUND_BACK_CANCEL_REASON,
} from './checkout-hold';

describe('checkout-hold copy', () => {
  it('formats hold deadlines in en-US UTC', () => {
    expect(formatHoldDeadline('2026-08-20T21:15:00.000Z')).toBe('Aug 20, 2026, 9:15 PM UTC');
  });

  it('renders unbound and bound holder copy with the deadline', () => {
    expect(holderUnboundCopy('2026-08-20T21:15:00.000Z')).toBe(
      'The item is held for you until Aug 20, 2026, 9:15 PM UTC.',
    );
    expect(holderBoundCopy('2026-08-20T21:15:00.000Z')).toBe(
      'Pay by Aug 20, 2026, 9:15 PM UTC. If the window ends, the item restocks.',
    );
    expect(holderUnboundCopy(null)).toBe('The item is held for you once a payment starts.');
  });

  it('detects late completion from paid plus leftover elapsed reason', () => {
    expect(isLateCompletionOrder({ state: 'paid', cancellationReason: PAYMENT_WINDOW_ELAPSED_REASON })).toBe(true);
    expect(isLateCompletionOrder({ state: 'paid', cancellationReason: null })).toBe(false);
    expect(isLateCompletionOrder({ state: 'cancelled', cancellationReason: PAYMENT_WINDOW_ELAPSED_REASON })).toBe(
      false,
    );
  });

  it('detects refund_required and elapsed-without-late-money', () => {
    expect(isRefundRequiredPayment({ reviewReason: 'refund_required' })).toBe(true);
    expect(
      isHoldExpiredNoLateMoney(
        { state: 'cancelled', cancellationReason: PAYMENT_WINDOW_ELAPSED_REASON },
        { state: 'expired', reviewReason: null },
      ),
    ).toBe(true);
    expect(
      isHoldExpiredNoLateMoney(
        { state: 'cancelled', cancellationReason: PAYMENT_WINDOW_ELAPSED_REASON },
        { state: 'manual_review', reviewReason: 'refund_required' },
      ),
    ).toBe(false);
  });

  it('picks seller refund instructions per rail', () => {
    expect(refundRequiredSellerCopy('paypal')).toBe(CHECKOUT_HOLD_COPY.refundRequiredPaypalSeller);
    expect(refundRequiredSellerCopy('stripe')).toBe(CHECKOUT_HOLD_COPY.refundRequiredStripeSeller);
    expect(refundRequiredSellerCopy('bitcoin')).toBe(CHECKOUT_HOLD_COPY.refundRequiredBitcoinSeller);
    expect(UNBOUND_BACK_CANCEL_REASON.length).toBeGreaterThanOrEqual(1);
    expect(UNBOUND_BACK_CANCEL_REASON.length).toBeLessThanOrEqual(500);
  });

  it('splits refund_required copy by buyer vs seller role', () => {
    expect(refundRequiredCopyForRole(true, 'bitcoin')).toBe(CHECKOUT_HOLD_COPY.refundRequiredBuyer);
    expect(refundRequiredCopyForRole(true, 'paypal')).toBe(CHECKOUT_HOLD_COPY.refundRequiredBuyer);
    expect(refundRequiredCopyForRole(false, 'bitcoin')).toBe(CHECKOUT_HOLD_COPY.refundRequiredBitcoinSeller);
    expect(refundRequiredCopyForRole(false, 'paypal')).toBe(CHECKOUT_HOLD_COPY.refundRequiredPaypalSeller);
    expect(refundRequiredCopyForRole(false, 'stripe')).toBe(CHECKOUT_HOLD_COPY.refundRequiredStripeSeller);
  });
});
