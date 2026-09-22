import { describe, expect, it } from 'vitest';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import {
  buyerCheckoutStateLabel,
  extractCheckoutOrderIds,
  formatRemainingMmSs,
  getMarketplaceCheckoutRoute,
  intersectPaymentMethods,
  isAbandonedCheckout,
  isBuyerCheckoutInProgress,
  isBuyerOrderHistory,
  isSellerPaidOrder,
  isSellerReservation,
  readCheckoutHashOrderId,
  reservedWhileYouPayCopy,
  resolveCreatedCheckoutOrderIds,
  sellerReservationCopy,
} from './checkout-phase';

const BUYER = 'b'.repeat(52);
const SELLER = 's'.repeat(52);

describe('checkout-phase', () => {
  it('builds the checkout route without minting a second id', () => {
    expect(getMarketplaceCheckoutRoute()).toBe(MARKETPLACE_ROUTES.CHECKOUT);
    expect(getMarketplaceCheckoutRoute('018f47d2-6a27-7c23-a49d-000000000001')).toBe(
      `${MARKETPLACE_ROUTES.CHECKOUT}#018f47d2-6a27-7c23-a49d-000000000001`,
    );
  });

  it('keeps unpaid buyer rows out of order history', () => {
    expect(isBuyerOrderHistory({ state: 'pending_payment', buyerPubky: BUYER }, BUYER)).toBe(false);
    expect(isBuyerOrderHistory({ state: 'paid', buyerPubky: BUYER }, BUYER)).toBe(true);
    expect(isBuyerOrderHistory({ state: 'cancelled', buyerPubky: BUYER }, BUYER)).toBe(false);
    expect(isAbandonedCheckout({ state: 'cancelled', buyerPubky: BUYER }, BUYER)).toBe(true);
    expect(isBuyerCheckoutInProgress({ state: 'pending_payment', buyerPubky: BUYER }, BUYER)).toBe(true);
  });

  it('classifies seller reservations as unpaid holds, not orders', () => {
    const unpaid = { state: 'pending_payment', sellerPubky: SELLER, buyerPubky: BUYER };
    const paid = { state: 'paid', sellerPubky: SELLER, buyerPubky: BUYER };
    expect(isSellerReservation(unpaid, SELLER)).toBe(true);
    expect(isSellerPaidOrder(unpaid, SELLER)).toBe(false);
    expect(isSellerReservation(paid, SELLER)).toBe(false);
    expect(isSellerPaidOrder(paid, SELLER)).toBe(true);
  });

  it('labels unbound vs bound checkout without the word order', () => {
    expect(buyerCheckoutStateLabel({ paymentMethod: null })).toBe('Checkout in progress');
    expect(buyerCheckoutStateLabel({ paymentMethod: 'paypal' })).toBe('Reserved while you pay');
    expect(reservedWhileYouPayCopy('2099-01-01T00:00:00.000Z', Date.parse('2098-12-31T23:50:19.000Z'))).toBe(
      'Reserved while you pay · 9:41',
    );
    expect(formatRemainingMmSs(null)).toBeNull();
    expect(sellerReservationCopy('2099-01-01T00:10:00.000Z')).toMatch(/^Held for a buyer · restocks /);
  });

  it('reads order ids from the checkout command passthrough', () => {
    expect(extractCheckoutOrderIds({ kind: 'checkout' })).toEqual([]);
    expect(
      extractCheckoutOrderIds({
        kind: 'checkout',
        orders: [{ id: '018f47d2-6a27-7c23-a49d-000000000001' }, { id: '018f47d2-6a27-7c23-a49d-000000000002' }],
      }),
    ).toEqual(['018f47d2-6a27-7c23-a49d-000000000001', '018f47d2-6a27-7c23-a49d-000000000002']);
  });

  it('intersects seller rails and falls back to participant orders when create omits ids', () => {
    expect(
      intersectPaymentMethods([
        ['bitcoin', 'paypal'],
        ['paypal', 'stripe'],
      ]),
    ).toEqual(['paypal']);
    expect(intersectPaymentMethods([['bitcoin'], ['stripe']])).toEqual([]);
    expect(readCheckoutHashOrderId('#018f47d2-6a27-7c23-a49d-000000000001')).toBe(
      '018f47d2-6a27-7c23-a49d-000000000001',
    );
    expect(
      resolveCreatedCheckoutOrderIds({
        result: { kind: 'checkout' },
        listingAggregateIds: ['listing:a'],
        buyerPubky: BUYER,
        orders: [
          {
            id: '018f47d2-6a27-7c23-a49d-000000000009',
            state: 'pending_payment',
            buyerPubky: BUYER,
            lines: [{ listingAggregateId: 'listing:a' }],
          },
        ],
      }),
    ).toEqual(['018f47d2-6a27-7c23-a49d-000000000009']);
  });
});
