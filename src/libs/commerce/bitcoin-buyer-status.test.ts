import { describe, expect, it } from 'vitest';
import {
  buyerBitcoinWalletCopy,
  buyerCheckoutProgressCopy,
  PAYMENT_CONFIRMED_REVIEW_COPY,
  PAYMENT_SEEN_LABEL,
  PAYMENT_SEEN_WAITING_COPY,
  sellerBitcoinConfirmPrompt,
  sellerBitcoinDecision,
} from './bitcoin-buyer-status';

const seenOrder = {
  paymentMethod: 'bitcoin' as const,
  paykitRequestState: 'awaiting_seller_confirmation',
  paykitDeliveryState: 'delivered',
  holdExpiresAt: '2026-09-29T10:56:41.980Z',
  paykitSellerConfirmationDeadline: '2026-09-29T10:56:41.980Z',
  paykitTotalSats: 1_303,
  merchandiseTotal: { amountMinor: 1_000, currency: 'BTC', exponent: 8 },
  bitcoinPayable: { amountMinor: 1_303, currency: 'SAT', exponent: 0 },
  subtotal: { amountMinor: 1_000, currency: 'BTC', exponent: 8 },
  shipping: { amountMinor: 0, currency: 'BTC', exponent: 8 },
  total: { amountMinor: 1_303, currency: 'BTC', exponent: 8 },
};

describe('bitcoin buyer status', () => {
  it('names the seller confirm-by time once a payment is seen', () => {
    expect(buyerCheckoutProgressCopy(seenOrder, Date.parse('2026-09-28T11:00:00.000Z'))).toBe(
      'Seller confirms by Sep 29, 2026, 10:56 AM UTC.',
    );
    expect(buyerCheckoutProgressCopy(seenOrder)).not.toMatch(/Reserved while you pay|Pay by/);
    expect(buyerBitcoinWalletCopy(seenOrder, { state: 'awaiting_entitlement' })).toEqual({
      kind: 'seen',
      text: PAYMENT_SEEN_WAITING_COPY,
    });
    expect(sellerBitcoinConfirmPrompt(seenOrder)).toBe('Confirm you received ₿1,303');
    expect(sellerBitcoinDecision(seenOrder, { state: 'awaiting_entitlement' })).toBe('confirm');
  });

  it('keeps the pay-by countdown until the payment is seen', () => {
    expect(
      buyerCheckoutProgressCopy(
        { paymentMethod: 'bitcoin', paykitRequestState: 'pending', holdExpiresAt: '2026-09-28T11:05:00.000Z' },
        Date.parse('2026-09-28T11:00:00.000Z'),
      ),
    ).toBe('Reserved while you pay · 5:00');
    expect(
      buyerBitcoinWalletCopy(
        { paykitRequestState: 'pending', paykitDeliveryState: 'delivered' },
        { state: 'awaiting_entitlement' },
      ).text,
    ).toContain('Open Bitkit to pay');
  });

  it('tells the buyer a late confirmation is in review, not that they should pay again', () => {
    const reviewed = { ...seenOrder, paykitRequestState: 'confirmed' as const };
    expect(buyerBitcoinWalletCopy(reviewed, { state: 'manual_review', reviewReason: 'late_settlement' })).toEqual({
      kind: 'review',
      text: PAYMENT_CONFIRMED_REVIEW_COPY,
    });
    expect(buyerCheckoutProgressCopy(reviewed)).toBe(PAYMENT_SEEN_LABEL);
    expect(sellerBitcoinDecision(reviewed, { state: 'manual_review', reviewReason: 'late_settlement' })).toBe(
      'resolve',
    );
    expect(PAYMENT_CONFIRMED_REVIEW_COPY).not.toMatch(/pay again|Open Bitkit/i);
  });
});
