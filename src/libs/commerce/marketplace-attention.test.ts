import { describe, expect, it } from 'vitest';
import {
  countOrdersNeedingAttention,
  isMarketplaceActionActivity,
  readOrdersSeenAt,
  writeOrdersSeenAt,
} from './marketplace-attention';

const ME = 'm'.repeat(52);
const THEM = 't'.repeat(52);

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('marketplace attention', () => {
  it('badges action events and leaves informational payment rows alone', () => {
    expect(isMarketplaceActionActivity('return_updated')).toBe(true);
    expect(isMarketplaceActionActivity('offer_received')).toBe(true);
    expect(isMarketplaceActionActivity('message_received')).toBe(true);
    expect(isMarketplaceActionActivity('pickup_ready')).toBe(true);
    expect(isMarketplaceActionActivity('payment_confirmed')).toBe(false);
    expect(isMarketplaceActionActivity('order_shipped')).toBe(false);
  });

  it('counts orders that still need this identity and are newer than last seen', () => {
    const orders = [
      {
        nextActor: 'seller' as const,
        buyerPubky: THEM,
        sellerPubky: ME,
        updatedAt: '2026-09-23T12:00:00.000Z',
      },
      {
        nextActor: 'buyer' as const,
        buyerPubky: THEM,
        sellerPubky: ME,
        updatedAt: '2026-09-23T12:00:00.000Z',
      },
      {
        nextActor: 'seller' as const,
        buyerPubky: THEM,
        sellerPubky: ME,
        updatedAt: '2026-09-01T12:00:00.000Z',
      },
    ];
    expect(countOrdersNeedingAttention(orders, ME, 0)).toBe(2);
    expect(countOrdersNeedingAttention(orders, ME, Date.parse('2026-09-20T00:00:00.000Z'))).toBe(1);
  });

  it('stores last-seen per identity and never moves it backward', () => {
    const storage = memoryStorage();
    expect(readOrdersSeenAt(ME, storage)).toBe(0);
    expect(writeOrdersSeenAt(ME, 100, storage)).toBe(true);
    expect(writeOrdersSeenAt(ME, 50, storage)).toBe(false);
    expect(readOrdersSeenAt(ME, storage)).toBe(100);
    expect(readOrdersSeenAt(THEM, storage)).toBe(0);
  });
});
