// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplacePaymentSettings } from '@/templates/Marketplace/MarketplacePaymentSettings';

const view = vi.hoisted(() => ({
  locksConnect: {
    connectedCreator: null as string | null,
    isExchanging: false,
    error: null as string | null,
  },
  config: {
    bitcoinEnabled: true,
    stripePaymentLink: 'https://buy.stripe.com/test_fixture',
    paypalMerchantEmail: 'seller@example.com',
    stripeRestrictedKeySet: true,
    updatedAt: '2026-08-22T12:00:00.000Z',
  } as {
    bitcoinEnabled: boolean;
    stripePaymentLink: string | null;
    paypalMerchantEmail: string | null;
    stripeRestrictedKeySet: boolean;
    updatedAt: string;
  },
  claimed: true as boolean,
  // The device-local verified claim that keeps the stored bitcoinEnabled:true
  // loadable: without it the hook fails closed and the toggle loads OFF.
  storedClaim: {
    id: 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco',
    owner_id: 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco',
    xpub: 'xpub6DNfJehqF1LUs9kwaqDu12Ajpz9psYVtbGhTykQo1CYdkkqV2vAyR4DiWXSTTDujWHzVy1AtV6ENGKWgwbLWqa4wXMZR4ZmdpRjQBG5EgTV',
    key_fingerprint_hex: '5f9600ba5b1bf3f0',
    account_index: 0,
    first_derived_address: 'bc1qgkju4yvvtuz0s8vqn837q396jezu2h8ex7gk98',
    source: 'session_claim',
    verified_at: 1_756_000_000_000,
  } as null | {
    id: string;
    owner_id: string;
    xpub: string | null;
    key_fingerprint_hex: string;
    account_index: number | null;
    first_derived_address: string;
    source: string;
    verified_at: number;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace/settings',
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getPaykitSetupUrl: () => 'https://paykit.example/setup',
    getMyPaymentConfig: vi.fn(async () => view.config),
    isOwnPaykitAccountClaimed: vi.fn(async () => view.claimed),
    getMyVerifiedPaykitClaim: vi.fn(async () => view.storedClaim),
    commitSaveVerifiedPaykitClaim: vi.fn(async () => {}),
    beginPaykitClaimFlow: vi.fn(),
    beginPaykitClaimStatusFlow: vi.fn(),
    putMyPaymentConfig: vi.fn(),
    beginMarketplaceSessionConnect: vi.fn(),
  },
}));

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
  const FULL_CONFIG = { ...view.config };
  const STORED_CLAIM = view.storedClaim;

  beforeEach(async () => {
    // The claim gate normalizes the stored xpub against the configured
    // network: pin a mainnet deployment so the restored claim validates.
    process.env.PUBKY_RUNTIME_BITCOIN_NETWORK = 'mainnet';
    const { resetRuntimeConfigForTests } = await import('@/libs/runtime-config/runtime-config');
    resetRuntimeConfigForTests();
    view.config = { ...FULL_CONFIG };
    view.claimed = true;
    view.storedClaim = STORED_CLAIM;
    // The Get paid section requires a marketplace session; a fixture session
    // makes the full form render deterministically in every baseline.
    const { useCommerceStore } = await import('@/stores/commerce/commerce.store');
    useCommerceStore.setState({
      marketplaceSession: {
        pubky: 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco',
        capabilities: '/pub/pubky.app/:rw',
        expiresAt: '2026-09-21T12:00:00.000Z',
        issuedAt: '2026-08-21T12:00:00.000Z',
      },
    });
  });

  afterEach(async () => {
    delete process.env.PUBKY_RUNTIME_BITCOIN_NETWORK;
    const { resetRuntimeConfigForTests } = await import('@/libs/runtime-config/runtime-config');
    resetRuntimeConfigForTests();
  });

  it('renders the payments and Locks setup at desktop viewport', async () => {
    view.locksConnect = { connectedCreator: null, isExchanging: false, error: null };

    const screen = await renderForVRT(<MarketplacePaymentSettings />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('payment-settings-new-seller-desktop');
  });

  it('renders the payments and Locks setup at mobile viewport', async () => {
    view.locksConnect = { connectedCreator: null, isExchanging: false, error: null };

    const screen = await renderForVRT(<MarketplacePaymentSettings />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('payment-settings-new-seller-mobile');
  });

  // The completed state is driven by a REAL signal: the Lock Server's
  // frontend-session exchange proved creator authority for this seller.
  it('renders the connected Lock Server setup state at desktop viewport', async () => {
    view.locksConnect = {
      connectedCreator: 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco',
      isExchanging: false,
      error: null,
    };

    const screen = await renderForVRT(<MarketplacePaymentSettings />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('payment-settings-locks-connected-desktop');
    view.locksConnect = { connectedCreator: null, isExchanging: false, error: null };
  });

  // A taller viewport so the display-preferences card at the bottom of the
  // page (the approximate-conversion toggle and the measurement-system
  // select) is inside the capture.
  it('renders the display preferences controls at desktop viewport', async () => {
    view.locksConnect = { connectedCreator: null, isExchanging: false, error: null };
    const { useMarketplaceDisplayStore } = await import('@/stores/marketplace-display/marketplace-display.store');
    useMarketplaceDisplayStore.setState({ showFxEstimate: true, measurementSystem: 'imperial' });

    const screen = await renderForVRT(<MarketplacePaymentSettings />, { viewport: { width: 1440, height: 1600 } });
    await expect.element(screen.getByText('Display preferences')).toBeInTheDocument();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('payment-settings-display-preferences-desktop');
    useMarketplaceDisplayStore.setState({ showFxEstimate: true, measurementSystem: null });
  });

  // The BLOCKED state: a claim exists on the server but nothing is verified
  // on this device — the Accept-bitcoin toggle is disabled with the
  // re-verify reason and the Verify-with-Ring action.
  it('renders the blocked Accept-bitcoin state at desktop viewport', async () => {
    view.locksConnect = { connectedCreator: null, isExchanging: false, error: null };
    view.config = {
      bitcoinEnabled: false,
      stripePaymentLink: null,
      paypalMerchantEmail: null,
      stripeRestrictedKeySet: false,
      updatedAt: '2026-08-22T12:00:00.000Z',
    };
    view.storedClaim = null;

    const screen = await renderForVRT(<MarketplacePaymentSettings />, { viewport: { width: 1440, height: 1600 } });
    await expect.element(screen.getByTestId('bitcoin-enable-blocked-reason')).toBeInTheDocument();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('payment-settings-bitcoin-blocked-desktop');
  });
});
