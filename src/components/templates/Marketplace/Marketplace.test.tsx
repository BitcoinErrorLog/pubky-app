import { renderToString } from 'react-dom/server';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import {
  buildFeatureDiscoveryDeviceStorageKey,
  FEATURE_DISCOVERY_STORAGE_PREFIX,
  MARKETPLACE_PROMO_STORAGE_ID,
} from '@/config/featureDiscovery';
import { createCommerceShopFixture } from '@/test/fixtures/commerce/commerce';
import { Marketplace } from './Marketplace';

const routerPush = vi.hoisted(() => vi.fn());
const setSaleFormat = vi.hoisted(() => vi.fn());
const promoDismiss = vi.hoisted(() => vi.fn());
const promoState = vi.hoisted(() => ({ showPromo: false }));
const navCounts = vi.hoisted(() => ({ cart: 0, activity: 0 }));
const catalogState = vi.hoisted(() => ({
  listings: [] as Array<{ id: string; title: string }>,
  isLoading: false,
  adapterMode: 'sandbox' as 'sandbox' | 'transaction-service' | 'locks-paykit' | 'unavailable',
}));
const runtime = vi.hoisted(() => ({ deployEnv: 'staging' as 'production' | 'staging' | undefined }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => '/marketplace',
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ isAuthenticated: false, requireAuth: (action: () => void) => action() }),
}));

vi.mock('@/libs/runtime-config/runtime-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/runtime-config/runtime-config')>();
  return { ...actual, getDeployEnv: () => runtime.deployEnv };
});

vi.mock('@/hooks/useMarketplaceCatalog/useMarketplaceCatalog', () => ({
  useMarketplaceCatalog: (
    initialListings: typeof catalogState.listings = [],
    initialShops: Array<{ ownerPubky: string; name: string }> = [],
  ) => ({
    listings: catalogState.isLoading && initialListings.length > 0 ? initialListings : catalogState.listings,
    facetPool: catalogState.isLoading && initialListings.length > 0 ? initialListings : catalogState.listings,
    shopsBySeller: new Map(initialShops.map((shop) => [shop.ownerPubky, shop])),
    isLoading: catalogState.isLoading,
    adapterMode: catalogState.adapterMode,
  }),
}));

vi.mock('@/hooks/useMarketplacePromoDismissal/useMarketplacePromoDismissal', () => ({
  useMarketplacePromoDismissal: () => ({ showPromo: promoState.showPromo, dismissPromo: promoDismiss }),
}));

vi.mock('@/hooks/useMarketplaceWatchDetection/useMarketplaceWatchDetection', () => ({
  useMarketplaceWatchDetection: () => {},
}));

vi.mock('@/hooks/useMarketplaceCartCount/useMarketplaceCartCount', () => ({
  useMarketplaceCartCount: () => navCounts.cart,
}));

vi.mock('@/hooks/useMarketplaceActivityUnread/useMarketplaceActivityUnread', () => ({
  useMarketplaceActivityUnread: () => navCounts.activity,
}));

vi.mock('@/stores/commerce/commerce.store', () => ({
  useCommerceStore: (selector: (state: { layout: 'grid'; setSaleFormat: typeof setSaleFormat }) => unknown) =>
    selector({ layout: 'grid', setSaleFormat }),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/organisms/Marketplace/MarketplaceFilters', () => ({
  MarketplaceFilters: () => <div data-testid="marketplace-filters" />,
}));

vi.mock('@/hooks/useMarketplaceLiveBid/useMarketplaceLiveBid', () => ({
  useMarketplaceLiveBid: () => ({ ref: () => {}, bid: null }),
}));

vi.mock('@/hooks/useCommerceFavorite/useCommerceFavorite', () => ({
  useCommerceFavorite: () => ({ isFavorite: false, isLoading: false, isMutating: false, toggle: vi.fn() }),
}));

vi.mock('@/hooks/useIndicativeBtcRate/useIndicativeBtcRate', () => ({
  useIndicativeBtcRate: () => null,
}));

describe('Marketplace', () => {
  beforeEach(() => {
    routerPush.mockClear();
    setSaleFormat.mockClear();
    promoDismiss.mockClear();
    promoState.showPromo = false;
    navCounts.cart = 0;
    navCounts.activity = 0;
    catalogState.listings = [];
    catalogState.isLoading = false;
    catalogState.adapterMode = 'sandbox';
    runtime.deployEnv = 'staging';
    window.localStorage.clear();
  });

  it('renders the marketplace section navigation and primary actions in SSR markup', () => {
    const html = renderToString(<Marketplace />);

    expect(html).toContain('data-testid="marketplace-section-nav"');
    expect(html).toContain('Sell an item');
    expect(html).toContain('Browse auctions');
    expect(html).toContain('Seller studio');
  });

  it('shows the staging disclosure by deploy environment', () => {
    const { rerender } = render(<Marketplace />);

    expect(screen.getByRole('note')).toHaveTextContent('Staging environment — test rails, no real funds move');
    expect(screen.queryByText('Real money. Payments are final and go directly to the seller.')).not.toBeInTheDocument();

    runtime.deployEnv = 'production';
    catalogState.adapterMode = 'transaction-service';
    rerender(<Marketplace />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('fails closed to the real-money side for an unknown deploy environment', () => {
    runtime.deployEnv = undefined;
    render(<Marketplace />);

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('renders guest catalog cards from server listings while the local cache hydrates', () => {
    catalogState.isLoading = true;
    const initialListings = [
      {
        id: 'seller:boots_01',
        sellerId: 'y'.repeat(52),
        listingId: 'boots_01',
        state: 'active' as const,
        title: 'Vintage leather boots',
        description: 'Well cared for boots with light wear.',
        categoryId: 'fashion-shoes-boots',
        condition: 'good' as const,
        tags: ['vintage'],
        saleFormat: 'fixed_price' as const,
        price: { amountMinor: 12_500, currency: 'USD', exponent: 2 },
        auction: null,
        attributes: null,
        location: { countryCode: 'US', region: 'NY' },
        mediaUrls: [],
        reputation: null,
        revision: 1,
        updatedAt: Date.parse('2026-08-19T21:00:00.000Z'),
      },
    ];

    const html = renderToString(
      <Marketplace initialListings={initialListings} initialShops={[createCommerceShopFixture()]} />,
    );

    expect(html).toContain('Vintage leather boots');
    expect(html).toContain('Satoshi Vintage');
    expect(html).toContain('Buy now');
    expect(html).not.toContain('marketplace-skeleton');
    expect(html).not.toContain(`${'y'.repeat(8)}…`);

    render(<Marketplace initialListings={initialListings} />);

    expect(screen.getByRole('heading', { name: 'Vintage leather boots' })).toBeInTheDocument();
    expect(
      within(screen.getByTestId('marketplace-section-nav')).getByRole('link', { name: 'Orders' }),
    ).toBeInTheDocument();
  });

  it('gates section navigation through the existing auth flow', async () => {
    const user = userEvent.setup();

    render(<Marketplace />);

    await user.click(within(screen.getByTestId('marketplace-section-nav')).getByRole('link', { name: 'Orders' }));

    expect(routerPush).toHaveBeenCalledWith(MARKETPLACE_ROUTES.ORDERS);
  });

  it('persists marketplace promo dismissal for the device', async () => {
    const user = userEvent.setup();
    promoState.showPromo = true;

    render(<Marketplace />);

    const dismissButton = await screen.findByRole('button', { name: 'Dismiss marketplace promo' });
    await user.click(dismissButton);

    expect(promoDismiss).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(buildFeatureDiscoveryDeviceStorageKey(MARKETPLACE_PROMO_STORAGE_ID))).toBe(
      'dismissed',
    );
    expect(buildFeatureDiscoveryDeviceStorageKey(MARKETPLACE_PROMO_STORAGE_ID)).toBe(
      `${FEATURE_DISCOVERY_STORAGE_PREFIX}:${MARKETPLACE_PROMO_STORAGE_ID}`,
    );
    expect(screen.queryByRole('region', { name: 'Marketplace promo' })).not.toBeInTheDocument();
  });
});
