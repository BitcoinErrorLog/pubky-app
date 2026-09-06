import { describe, expect, it } from 'vitest';
import type { SellerPaymentConfigOwnView } from '@/libs/commerce/payment-methods';
import { deriveBitcoinStatus, derivePaypalStatus, deriveStripeStatus } from './MarketplaceGetPaidSettings.utils';

const baseConfig: SellerPaymentConfigOwnView = {
  bitcoinEnabled: false,
  stripePaymentLink: null,
  paypalMerchantEmail: null,
  stripeRestrictedKeySet: false,
  updatedAt: '2026-08-22T12:00:00.000Z',
};

describe('MarketplaceGetPaidSettings status derivation', () => {
  describe('derivePaypalStatus', () => {
    it('is not set up without config or email', () => {
      expect(derivePaypalStatus(null)).toBe('not_set_up');
      expect(derivePaypalStatus(baseConfig)).toBe('not_set_up');
    });

    it('is connected once a merchant email is stored', () => {
      expect(derivePaypalStatus({ ...baseConfig, paypalMerchantEmail: 'seller@example.com' })).toBe('connected');
    });
  });

  describe('deriveStripeStatus', () => {
    it('is not set up with neither link nor key', () => {
      expect(deriveStripeStatus(null)).toBe('not_set_up');
      expect(deriveStripeStatus(baseConfig)).toBe('not_set_up');
    });

    it('needs attention when only half of the pair is configured', () => {
      expect(deriveStripeStatus({ ...baseConfig, stripePaymentLink: 'https://buy.stripe.com/test_abc' })).toBe(
        'needs_attention',
      );
      expect(deriveStripeStatus({ ...baseConfig, stripeRestrictedKeySet: true })).toBe('needs_attention');
    });

    it('is connected with both the payment link and the restricted key', () => {
      expect(
        deriveStripeStatus({
          ...baseConfig,
          stripePaymentLink: 'https://buy.stripe.com/test_abc',
          stripeRestrictedKeySet: true,
        }),
      ).toBe('connected');
    });
  });

  describe('deriveBitcoinStatus', () => {
    it('is not set up when nothing is claimed and nothing failed', () => {
      expect(deriveBitcoinStatus({ accountClaimed: null, locksError: null, claimError: null })).toBe('not_set_up');
      expect(deriveBitcoinStatus({ accountClaimed: false, locksError: null, claimError: null })).toBe('not_set_up');
    });

    it('is connected once the watch-only account is claimed', () => {
      expect(deriveBitcoinStatus({ accountClaimed: true, locksError: null, claimError: null })).toBe('connected');
    });

    it('needs attention when the Lock Server connect or the claim flow errored', () => {
      expect(deriveBitcoinStatus({ accountClaimed: null, locksError: 'rejected', claimError: null })).toBe(
        'needs_attention',
      );
      expect(deriveBitcoinStatus({ accountClaimed: true, locksError: null, claimError: 'failed' })).toBe(
        'needs_attention',
      );
    });
  });
});
