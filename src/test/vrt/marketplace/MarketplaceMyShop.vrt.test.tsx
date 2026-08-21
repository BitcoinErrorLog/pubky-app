// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplaceMyShop } from '@/templates/Marketplace/MarketplaceMyShop';

const configuredShop = vi.hoisted(() => ({
  name: 'Satoshi Vintage',
  bio: 'Circular fashion and Bitcoin.',
  countryCode: 'US',
  region: 'NY',
  shippingPolicy: 'Ships within three business days.',
  returnPolicy: 'Returns accepted within 30 days.',
  vacationMode: true,
}));

const view = vi.hoisted(() => ({
  configured: false,
  isLoading: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace/my-shop',
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'y'.repeat(52) }),
}));

vi.mock('@/hooks/useMarketplaceShopSettings/useMarketplaceShopSettings', async () => {
  const { useForm } = await import('react-hook-form');
  const { marketplaceShopSettingsDefaults } =
    await import('@/hooks/useMarketplaceShopSettings/useMarketplaceShopSettings.types');
  return {
    useMarketplaceShopSettings: () => ({
      form: useForm({ defaultValues: view.configured ? configuredShop : marketplaceShopSettingsDefaults }),
      revision: view.configured ? 3 : 0,
      isLoading: view.isLoading,
      hasShop: view.configured,
      submit: vi.fn(async () => false),
    }),
  };
});

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main className="w-full py-6">{children}</main>,
}));

describe('Marketplace my shop — visual regression', () => {
  it('renders the create-shop state for a seller without a shop at desktop viewport', async () => {
    view.configured = false;
    view.isLoading = false;

    const screen = await renderForVRT(<MarketplaceMyShop />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('my-shop-create-desktop');
  });

  it('renders the create-shop state at mobile viewport', async () => {
    view.configured = false;
    view.isLoading = false;

    const screen = await renderForVRT(<MarketplaceMyShop />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('my-shop-create-mobile');
  });

  it('renders the edit state for an existing shop at desktop viewport', async () => {
    view.configured = true;
    view.isLoading = false;

    const screen = await renderForVRT(<MarketplaceMyShop />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('my-shop-edit-desktop');
  });

  it('renders the loading skeleton at desktop viewport', async () => {
    view.configured = false;
    view.isLoading = true;

    const screen = await renderForVRT(<MarketplaceMyShop />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('my-shop-loading-desktop');
  });
});
