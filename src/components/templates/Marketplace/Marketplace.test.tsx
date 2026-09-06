import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import { FEATURE_DISCOVERY_STORAGE_PREFIX, MARKETPLACE_PROMO_STORAGE_ID } from '@/config/featureDiscovery';
import { Marketplace } from './Marketplace';

const routerPush = vi.hoisted(() => vi.fn());
const setSaleFormat = vi.hoisted(() => vi.fn());
const promoDismiss = vi.hoisted(() => vi.fn());
const promoState = vi.hoisted(() => ({ showPromo: false }));
const viewport = vi.hoisted(() => ({ isMobile: false }));
const navCounts = vi.hoisted(() => ({ cart: 0, activity: 0 }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ requireAuth: (action: () => void) => action() }),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => viewport.isMobile,
}));

vi.mock('@/hooks/useMarketplaceCatalog/useMarketplaceCatalog', () => ({
  useMarketplaceCatalog: () => ({
    listings: [],
    facetPool: {},
    shopsBySeller: new Map(),
    isLoading: false,
    adapterMode: 'sandbox',
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

vi.mock('@/organisms/Marketplace/MarketplaceListingCard', () => ({
  MarketplaceListingCard: () => <article />,
}));

describe('Marketplace', () => {
  beforeEach(() => {
    routerPush.mockClear();
    setSaleFormat.mockClear();
    promoDismiss.mockClear();
    promoState.showPromo = false;
    viewport.isMobile = false;
    navCounts.cart = 0;
    navCounts.activity = 0;
    window.localStorage.clear();
  });

  it('renders an Orders marketplace nav entry for a signed-in buyer', async () => {
    const user = userEvent.setup();

    render(<Marketplace />);

    await user.click(screen.getByRole('button', { name: 'Orders' }));

    expect(routerPush).toHaveBeenCalledWith(MARKETPLACE_ROUTES.ORDERS);
    expect(screen.queryByRole('button', { name: /My marketplace/ })).not.toBeInTheDocument();
  });

  it('opens the mobile marketplace tools sheet with badge counts', async () => {
    const user = userEvent.setup();
    viewport.isMobile = true;
    navCounts.cart = 3;
    navCounts.activity = 5;

    render(<Marketplace />);

    await user.click(screen.getByRole('button', { name: /My marketplace/ }));

    expect(screen.getByTestId('marketplace-buyer-tools-sheet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Messages' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Watchlist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cart, 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activity, 5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seller dashboard' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Seller dashboard' }));

    expect(routerPush).toHaveBeenCalledWith(MARKETPLACE_ROUTES.DASHBOARD);
  });

  it('persists marketplace promo dismissal for the device', async () => {
    const user = userEvent.setup();
    promoState.showPromo = true;

    render(<Marketplace />);

    const dismissButton = await screen.findByRole('button', { name: 'Dismiss marketplace promo' });
    await user.click(dismissButton);

    expect(promoDismiss).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(`${FEATURE_DISCOVERY_STORAGE_PREFIX}:${MARKETPLACE_PROMO_STORAGE_ID}`)).toBe(
      'dismissed',
    );
    expect(screen.queryByRole('region', { name: 'Marketplace promo' })).not.toBeInTheDocument();
  });
});
