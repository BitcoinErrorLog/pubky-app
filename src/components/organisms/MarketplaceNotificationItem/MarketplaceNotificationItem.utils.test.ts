import { describe, expect, it } from 'vitest';
import { getMarketplaceNotificationActionText } from './MarketplaceNotificationItem.utils';

describe('getMarketplaceNotificationActionText', () => {
  it('renders the mechanical base text when the payload carries no amount', () => {
    expect(getMarketplaceNotificationActionText({ type: 'auction_ended' })).toBe('ended an auction');
    expect(getMarketplaceNotificationActionText({ type: 'outbid' })).toBe('outbid you in an auction');
    expect(getMarketplaceNotificationActionText({ type: 'offer_received' })).toBe('sent you an offer');
  });

  it('appends the §8-permitted amount to auction and offer copy', () => {
    const usd = { amountMinor: 8_500, currency: 'USD', exponent: 2 };
    expect(getMarketplaceNotificationActionText({ type: 'auction_ended', amount: usd })).toBe(
      'ended an auction at $85.00',
    );
    expect(getMarketplaceNotificationActionText({ type: 'auction_won', amount: usd })).toBe(
      'closed an auction you won at $85.00',
    );
    expect(getMarketplaceNotificationActionText({ type: 'outbid', amount: usd })).toBe(
      'outbid you in an auction — now at $85.00',
    );
    expect(getMarketplaceNotificationActionText({ type: 'offer_received', amount: usd })).toBe(
      'sent you an offer of $85.00',
    );
    expect(getMarketplaceNotificationActionText({ type: 'offer_countered', amount: usd })).toBe(
      'countered an offer at $85.00',
    );
    expect(getMarketplaceNotificationActionText({ type: 'offer_accepted', amount: usd })).toBe(
      'accepted an offer of $85.00',
    );
    expect(getMarketplaceNotificationActionText({ type: 'offer_rejected', amount: usd })).toBe(
      'declined an offer of $85.00',
    );
  });

  it('renders bitcoin amounts per BIP-177: ₿ with grouped base units, never "sats"', () => {
    const text = getMarketplaceNotificationActionText({
      type: 'offer_received',
      amount: { amountMinor: 15_000, currency: 'BTC', exponent: 8 },
    });
    expect(text).toBe('sent you an offer of ₿15,000');
    expect(text).not.toContain('sats');
  });

  it('falls back to the base text for types that never carry amounts', () => {
    expect(
      getMarketplaceNotificationActionText({
        type: 'order_created',
        amount: { amountMinor: 100, currency: 'USD', exponent: 2 },
      }),
    ).toBe('placed an order');
  });
});
