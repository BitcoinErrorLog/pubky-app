import { describe, expect, it } from 'vitest';
import {
  BITCOIN_BUYER_STATUS_TABLE,
  bitcoinConfirmationExists,
  buyerBitcoinWalletCopy,
  buyerCheckoutBadgeLabel,
  buyerCheckoutProgressCopy,
  PAYMENT_SEEN_LABEL,
  sellerBitcoinConfirmPrompt,
  sellerBitcoinDecision,
} from './bitcoin-buyer-status';

const NOW = Date.parse('2026-09-28T11:00:00.000Z');
const SHORT_HOLD = '2026-09-28T11:05:00.000Z';
const SELLER_DEADLINE = '2026-09-29T10:56:41.980Z';

const seenOrder = {
  paymentMethod: 'bitcoin' as const,
  paykitRequestState: 'awaiting_seller_confirmation' as const,
  paykitDeliveryState: 'delivered',
  holdExpiresAt: SELLER_DEADLINE,
  paykitSellerConfirmationDeadline: SELLER_DEADLINE,
  paykitTotalSats: 1_303,
  merchandiseTotal: { amountMinor: 1_000, currency: 'BTC', exponent: 8 },
  bitcoinPayable: { amountMinor: 1_303, currency: 'SAT', exponent: 0 },
  subtotal: { amountMinor: 1_000, currency: 'BTC', exponent: 8 },
  shipping: { amountMinor: 0, currency: 'BTC', exponent: 8 },
  total: { amountMinor: 1_303, currency: 'BTC', exponent: 8 },
};

describe('bitcoin buyer status', () => {
  it.each(BITCOIN_BUYER_STATUS_TABLE)('$id', (row) => {
    const order = {
      paymentMethod: 'bitcoin' as const,
      paykitRequestState: row.paykitRequestState,
      paykitDeliveryState: 'delivered' as const,
      holdExpiresAt: row.forbidsPayLabels ? SELLER_DEADLINE : SHORT_HOLD,
      paykitSellerConfirmationDeadline: row.forbidsPayLabels ? SELLER_DEADLINE : null,
    };
    const payment = {
      state: row.paymentState,
      reviewReason: row.reviewReason,
      confirmations: row.confirmations,
    };
    expect(bitcoinConfirmationExists(order, payment)).toBe(row.confirmationExists);
    const progress = buyerCheckoutProgressCopy(order, payment, NOW);
    const wallet = buyerBitcoinWalletCopy(order, payment);
    expect(progress).toBe(row.progress);
    expect(wallet.text).toBe(row.wallet);
    expect(buyerCheckoutBadgeLabel(order, payment)).toBe(
      row.forbidsPayLabels ? PAYMENT_SEEN_LABEL : 'Reserved while you pay',
    );
    if (row.forbidsPayLabels) {
      expect(progress).not.toMatch(/Reserved while you pay|Pay by/);
      expect(wallet.text).not.toMatch(/Reserved while you pay|Pay by|Open Bitkit to pay/);
    }
    if (!row.confirmationExists) {
      expect(progress).not.toMatch(/confirmed on-chain/);
      expect(wallet.text).not.toMatch(/confirmed on-chain/);
    }
  });

  it('names the seller confirm-by time once a payment is seen', () => {
    expect(buyerCheckoutProgressCopy(seenOrder, { state: 'awaiting_entitlement' }, NOW)).toBe(
      'Seller confirms by Sep 29, 2026, 10:56 AM UTC.',
    );
    expect(sellerBitcoinConfirmPrompt(seenOrder)).toBe('Confirm you received ₿1,303');
    expect(sellerBitcoinDecision(seenOrder, { state: 'awaiting_entitlement' })).toBe('confirm');
  });

  it('asks the seller to resolve a late settlement', () => {
    const reviewed = { ...seenOrder, paykitRequestState: 'confirmed' as const };
    expect(sellerBitcoinDecision(reviewed, { state: 'manual_review', reviewReason: 'late_settlement' })).toBe(
      'resolve',
    );
  });
});
