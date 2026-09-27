import { describe, expect, it } from 'vitest';
import { COMMERCE_LISTING_MAX_QUANTITY } from '@/config/commerce';
import {
  countableStockQuantity,
  formatListingStock,
  formatStockQuantity,
  isUnlimitedStock,
  UNLIMITED_STOCK_LABEL,
} from './unlimited-stock';

const digital = { fulfillmentMethods: ['digital' as const] };
const cap = COMMERCE_LISTING_MAX_QUANTITY;

describe('unlimited stock', () => {
  it('is unlimited only for a digital-only listing at the quantity cap', () => {
    expect(isUnlimitedStock(digital, cap)).toBe(true);
    expect(formatStockQuantity(digital, cap)).toBe(UNLIMITED_STOCK_LABEL);
    expect(isUnlimitedStock(digital, 4)).toBe(false);
    expect(formatStockQuantity(digital, 4)).toBe('4');
    expect(isUnlimitedStock({ fulfillmentMethods: ['physical'] }, cap)).toBe(false);
    expect(isUnlimitedStock({ fulfillmentMethods: ['physical', 'shipping', 'digital'] }, cap)).toBe(false);
    expect(isUnlimitedStock({ fulfillmentMethods: ['pickup', 'digital'] }, cap)).toBe(false);
    // `physical` is not a service method, so this record sells as digital-only.
    expect(isUnlimitedStock({ fulfillmentMethods: ['physical', 'digital'] }, cap)).toBe(true);
    expect(isUnlimitedStock({ fulfillmentMethods: ['digital'], digitalLock: { policyUri: 'locks' } }, cap)).toBe(false);
  });

  it('labels a listing Unlimited when any variant is at the cap', () => {
    const record = {
      ...digital,
      variants: [{ quantity: cap }, { quantity: 2 }],
    };
    expect(formatListingStock(record)).toBe(UNLIMITED_STOCK_LABEL);
    expect(
      countableStockQuantity({
        ...record,
        variants: [
          { quantity: cap, enabled: true },
          { quantity: 2, enabled: true },
        ],
      }),
    ).toBe(2);
    expect(countableStockQuantity({ ...digital, variants: [{ quantity: cap, enabled: false }] })).toBe(0);
    expect(
      formatListingStock({
        fulfillmentMethods: ['physical'],
        variants: [{ quantity: 3 }, { quantity: 4 }],
      }),
    ).toBe('7');
  });
});
