// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplacePaymentSettings } from '@/templates/Marketplace/MarketplacePaymentSettings';

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
  locksConnect: {
    connectedCreator: null as string | null,
    isExchanging: false,
    error: null as string | null,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace/settings',
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getPaykitSetupUrl: () => 'https://paykit.example/setup',
  },
}));

vi.mock('@/hooks/useMarketplaceShopSettings/useMarketplaceShopSettings', async () => {
  const { useForm } = await import('react-hook-form');
  const { marketplaceShopSettingsDefaults } =
    await import('@/hooks/useMarketplaceShopSettings/useMarketplaceShopSettings.types');
  return {
    useMarketplaceShopSettings: () => ({
      form: useForm({ defaultValues: view.configured ? configuredShop : marketplaceShopSettingsDefaults }),
      revision: view.configured ? 3 : 0,
      submit: vi.fn(async () => false),
    }),
  };
});

vi.mock('@/hooks/useMarketplaceLocksConnect/useMarketplaceLocksConnect', () => ({
  useMarketplaceLocksConnect: () => ({
    ...view.locksConnect,
    openConnect: vi.fn(),
  }),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main className="w-full py-6">{children}</main>,
}));

describe('Marketplace payment settings — visual regression', () => {
  it('renders the new-seller setup state at desktop viewport', async () => {
    view.configured = false;

    const screen = await renderForVRT(<MarketplacePaymentSettings />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('payment-settings-new-seller-desktop');
  });

  it('renders the new-seller setup state at mobile viewport', async () => {
    view.configured = false;

    const screen = await renderForVRT(<MarketplacePaymentSettings />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('payment-settings-new-seller-mobile');
  });

  it('renders an existing shop with saved policies at desktop viewport', async () => {
    view.configured = true;

    const screen = await renderForVRT(<MarketplacePaymentSettings />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('payment-settings-configured-desktop');
  });

  it('renders the Locks and Paykit connect steps at desktop viewport', async () => {
    view.configured = false;
    view.locksConnect = { connectedCreator: null, isExchanging: false, error: null };

    const screen = await renderForVRT(<MarketplacePaymentSettings />, { viewport: VRT_VIEWPORT_DESKTOP });
    // The connect-step cards and the pre-production warning sit below the shop
    // policies form, outside the viewport crop, so bring them into view.
    screen.getByRole('button', { name: 'Open Bitkit setup' }).element().scrollIntoView({ block: 'center' });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('payment-settings-integrations-desktop');
  });

  // The completed state is driven by a REAL signal: the Lock Server's
  // frontend-session exchange proved creator authority for this seller.
  it('renders the connected Lock Server setup state at desktop viewport', async () => {
    view.configured = false;
    view.locksConnect = {
      connectedCreator: 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco',
      isExchanging: false,
      error: null,
    };

    const screen = await renderForVRT(<MarketplacePaymentSettings />, { viewport: VRT_VIEWPORT_DESKTOP });
    screen.getByRole('button', { name: 'Open Bitkit setup' }).element().scrollIntoView({ block: 'center' });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('payment-settings-locks-connected-desktop');
    view.locksConnect = { connectedCreator: null, isExchanging: false, error: null };
  });
});
