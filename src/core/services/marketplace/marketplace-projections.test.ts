import { describe, expect, it } from 'vitest';
import { createOrderFixture } from '@/test/fixtures/commerce/orders';
import {
  createAuctionProjectionFixture,
  createViewerBidAuctionProjectionFixture,
} from '@/test/fixtures/commerce/projections';
import { marketplaceListingProjectionSchema, marketplaceOrderSchema } from './marketplace-projections';

/**
 * Taxation was removed from the marketplace: no tax computation in checkout
 * (the sandbox service no longer adds an 8% line), no `tax` money field on
 * the order projection, and no Tax line in the UI.
 *
 * This test is the guard against it coming back: the shared order-projection
 * schema must not expose a `tax` field, and a wire payload that still
 * carries one (a stale or non-conforming service) must not surface it in the
 * parsed order the UI renders from.
 */
describe('marketplace order projection — taxation removed', () => {
  it('exposes no tax field and a tax-free total on a valid order', () => {
    const fixture = createOrderFixture('pending_payment');
    const parsed = marketplaceOrderSchema.safeParse(fixture);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('tax' in parsed.data).toBe(false);
      // The total stands on its own: subtotal + shipping, nothing added for tax.
      expect(parsed.data.total.amountMinor).toBe(parsed.data.subtotal.amountMinor + parsed.data.shipping.amountMinor);
    }
  });

  it('ignores a tax field on the wire rather than reintroducing it', () => {
    const fixture = createOrderFixture('pending_payment');
    const payload = { ...fixture, tax: { amountMinor: 1_096, currency: 'USD', exponent: 2 } };
    const parsed = marketplaceOrderSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // `.passthrough()` keeps unknown wire keys on the object; the declared
      // projection (schema shape / parse result fields the UI types from)
      // must still omit `tax`.
      expect('tax' in marketplaceOrderSchema.shape).toBe(false);
      expect(parsed.data.total.amountMinor).toBe(parsed.data.subtotal.amountMinor + parsed.data.shipping.amountMinor);
    }
  });
});

describe('marketplace listing projection — viewer bid', () => {
  it('parses the live bidder viewer_bid shape', () => {
    const parsed = marketplaceListingProjectionSchema.safeParse(createViewerBidAuctionProjectionFixture());

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.viewerBid).toEqual({
        maximumAmount: { amountMinor: 7_000, currency: 'USD', exponent: 2 },
        minimumNextBid: { amountMinor: 7_001, currency: 'USD', exponent: 2 },
      });
    }
  });

  it('accepts projections without viewer_bid for sellers and other bidders', () => {
    const parsed = marketplaceListingProjectionSchema.safeParse(createAuctionProjectionFixture());

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.viewerBid).toBeUndefined();
  });

  it.each([
    ['currency', { currency: 'EUR' }],
    ['exponent', { exponent: 3 }],
  ])('drops viewer_bid when its %s does not match the auction money', (_field, mismatch) => {
    const fixture = createViewerBidAuctionProjectionFixture();
    fixture.viewerBid = { ...fixture.viewerBid!, minimumNextBid: { ...fixture.viewerBid!.minimumNextBid, ...mismatch } };

    const parsed = marketplaceListingProjectionSchema.safeParse(fixture);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.viewerBid).toBeUndefined();
      expect(parsed.data.auction?.currentPrice.amountMinor).toBe(4_500);
      expect(parsed.data.auction?.minimumIncrement.amountMinor).toBe(500);
    }
  });

  it('drops viewer_bid when maximumAmount alone has a currency mismatch', () => {
    const fixture = createViewerBidAuctionProjectionFixture();
    fixture.viewerBid = {
      ...fixture.viewerBid!,
      maximumAmount: { ...fixture.viewerBid!.maximumAmount, currency: 'EUR' },
    };

    const parsed = marketplaceListingProjectionSchema.safeParse(fixture);

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.viewerBid).toBeUndefined();
  });

  it('drops viewer_bid when minimumIncrement alone has a currency mismatch', () => {
    const fixture = createViewerBidAuctionProjectionFixture();
    fixture.auction = {
      ...fixture.auction!,
      minimumIncrement: { ...fixture.auction!.minimumIncrement, currency: 'EUR' },
    };

    const parsed = marketplaceListingProjectionSchema.safeParse(fixture);

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.viewerBid).toBeUndefined();
  });

  it('drops viewer_bid when minimumIncrement alone has an exponent mismatch', () => {
    const fixture = createViewerBidAuctionProjectionFixture();
    fixture.auction = {
      ...fixture.auction!,
      minimumIncrement: { ...fixture.auction!.minimumIncrement, exponent: 3 },
    };

    const parsed = marketplaceListingProjectionSchema.safeParse(fixture);

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.viewerBid).toBeUndefined();
  });

  it('keeps viewer_bid when all bid money fields match the auction', () => {
    const parsed = marketplaceListingProjectionSchema.safeParse(createViewerBidAuctionProjectionFixture());

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.viewerBid).toBeDefined();
  });
});
