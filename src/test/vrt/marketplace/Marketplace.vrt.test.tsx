// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFeatureDiscoveryStorageKey, MARKETPLACE_PROMO_STORAGE_ID } from '@/config/featureDiscovery';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { Marketplace } from '@/templates/Marketplace/Marketplace';

// No rate in this capture: the indicative-rate hook resolves to null (no
// rate -> no estimate), keeping the scenario network-free and byte-identical
// to the pre-estimate baseline.
vi.mock('@/hooks/useIndicativeBtcRate/useIndicativeBtcRate', () => ({
  useIndicativeBtcRate: () => null,
}));

const VRT_USER_PUBKY = vi.hoisted(() => 'y'.repeat(52));

const fixtures = vi.hoisted(async () => {
  const { createCommerceSandboxCatalog } = await import('@/libs/commerce/sandbox-catalog');
  const { buildMarketplaceCatalogItems } = await import('@/hooks/useMarketplaceCatalog/useMarketplaceCatalog.utils');
  const { toCommerceListingModel } = await import('@/test/fixtures/commerce/listing-models');

  const catalog = createCommerceSandboxCatalog();
  return {
    listings: buildMarketplaceCatalogItems(catalog.listings.map(toCommerceListingModel), []),
    shopsBySeller: new Map(catalog.shops.map((shop) => [shop.ownerPubky, shop])),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace',
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ requireAuth: (action: () => void) => action() }),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: VRT_USER_PUBKY }),
}));

vi.mock('@/hooks/useMarketplaceCatalog/useMarketplaceCatalog', async () => {
  const catalog = await fixtures;
  return {
    useMarketplaceCatalog: () => ({
      listings: catalog.listings,
      shopsBySeller: catalog.shopsBySeller,
      isLoading: false,
      adapterMode: 'sandbox',
    }),
  };
});

// The sandbox records carry pubky:// media URIs whose bytes exist nowhere a
// VRT browser could fetch them. Resolving to null renders the deterministic
// gradient fallback (the same honest state a failed load ends in) instead of
// racing a doomed network request during the screenshot. Cards WITH loaded
// images are captured in MarketplaceListingCards.vrt.test.tsx via a data URI.
vi.mock('@/libs/commerce/media-url', () => ({
  resolveMarketplaceMediaUrl: () => null,
  resolveFirstMarketplaceMediaUrl: () => null,
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main className="w-full py-6">{children}</main>,
}));

describe('Marketplace — visual regression', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the sandbox catalog with the promo visible at desktop viewport', async () => {
    const screen = await renderForVRT(<Marketplace />, { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('marketplace-desktop');
  });

  it('renders the sandbox catalog with the promo dismissed at desktop viewport', async () => {
    window.localStorage.setItem(
      buildFeatureDiscoveryStorageKey(VRT_USER_PUBKY, MARKETPLACE_PROMO_STORAGE_ID),
      'dismissed',
    );
    const screen = await renderForVRT(<Marketplace />, { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('marketplace-promo-dismissed-desktop');
  });

  it('renders the sandbox catalog at mobile viewport', async () => {
    const screen = await renderForVRT(<Marketplace />, { viewport: VRT_VIEWPORT_MOBILE, disableHover: true });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('marketplace-mobile');
  });
});
