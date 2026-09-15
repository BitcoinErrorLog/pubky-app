// Intentional import order — browser-mode mocks rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { expectVrtSurface, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplaceAwardCheckout } from '@/templates/Marketplace/MarketplaceAwardCheckout';

const state = vi.hoisted(() => ({
  outcome: 'active' as 'active' | 'expired' | 'success',
}));

const offer = {
  id: '00000000-0000-0000-0000-000000000901',
  state: 'accepted',
  award: {
    id: '00000000-0000-0000-0000-000000000902',
    state: 'active',
    listing: {
      aggregateId: `listing:${'s'.repeat(52)}_boots`,
      sellerPubky: 's'.repeat(52),
      listingId: 'boots',
      title: 'Vintage boots',
      listingRevision: 3,
      listingRecordSha256: 'a'.repeat(64),
    },
    variant: { id: 'variant_42', options: [{ name: 'Size', value: '42' }] },
    unitPrice: { amountMinor: 600, currency: 'USD', exponent: 2 },
    quantity: 1,
    convertBy: '2026-09-15T12:00:00.000Z',
    subtotal: { amountMinor: 600, currency: 'USD', exponent: 2 },
    shipping: { amountMinor: 100, currency: 'USD', exponent: 2 },
    merchandiseTotal: { amountMinor: 700, currency: 'USD', exponent: 2 },
  },
};

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('offer=00000000-0000-0000-0000-000000000901'),
}));
vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/hooks/useMarketplaceOffers/useMarketplaceOffers', () => ({
  useMarketplaceOffers: () => ({
    offers: [state.outcome === 'expired' ? { ...offer, award: { ...offer.award, state: 'expired' } } : offer],
    refresh: vi.fn(async () => {}),
  }),
}));
vi.mock('@/hooks/useMarketplaceCart/useMarketplaceCart', () => ({
  useMarketplaceCart: () => ({
    awardItems: [{ awardId: offer.award.id, listingId: 's:boots', variantId: 'variant_42' }],
    remove: vi.fn(async () => {}),
  }),
}));
vi.mock('@/hooks/useMarketplaceAddressBook/useMarketplaceAddressBook', () => ({
  useMarketplaceAddressBook: () => ({
    addresses: [
      {
        id: 'home',
        label: 'Home',
        name: 'Alice Buyer',
        line1: '1 Market Street',
        line2: '',
        city: 'New York',
        region: 'NY',
        postal_code: '10001',
        country_code: 'US',
      },
    ],
  }),
}));
vi.mock('@/hooks/useMarketplaceOfferCheckout/useMarketplaceOfferCheckout', () => ({
  useMarketplaceOfferCheckout: () => ({
    submit: vi.fn(async () =>
      state.outcome === 'success'
        ? { ok: true, orderId: '00000000-0000-0000-0000-000000000903' }
        : { ok: false, code: 'AWARD_EXPIRED' },
    ),
  }),
}));

describe('Marketplace award checkout — visual regression', () => {
  beforeEach(() => {
    state.outcome = 'active';
  });

  async function capture(scene: string, viewport = VRT_VIEWPORT_DESKTOP) {
    await renderForVRT(<MarketplaceAwardCheckout />, { viewport });
    const surface = expectVrtSurface('marketplace-award-checkout');
    await expect(surface).toMatchScreenshot(scene);
  }

  it('captures the active award checkout at desktop viewport', async () => {
    await capture('award-checkout-desktop');
  });

  it('captures the active award checkout at mobile viewport', async () => {
    await capture('award-checkout-mobile', VRT_VIEWPORT_MOBILE);
  });

  it('captures the expired state', async () => {
    state.outcome = 'expired';
    await capture('award-checkout-expired-desktop');
  });

  it('captures the success state', async () => {
    state.outcome = 'success';
    const screen = await renderForVRT(<MarketplaceAwardCheckout />, { viewport: VRT_VIEWPORT_DESKTOP });
    await userEvent.click(screen.getByRole('button', { name: 'Pay agreed price' }));
    const surface = expectVrtSurface('marketplace-award-checkout');
    await expect(surface).toMatchScreenshot('award-checkout-success-desktop');
  });
});
