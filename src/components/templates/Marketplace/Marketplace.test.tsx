import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import {
  buildFeatureDiscoveryDeviceStorageKey,
  FEATURE_DISCOVERY_STORAGE_PREFIX,
  MARKETPLACE_PROMO_STORAGE_ID,
} from '@/config/featureDiscovery';
import { Marketplace } from './Marketplace';

const routerPush = vi.hoisted(() => vi.fn());
const setSaleFormat = vi.hoisted(() => vi.fn());
const promoDismiss = vi.hoisted(() => vi.fn());
const promoState = vi.hoisted(() => ({ showPromo: false }));
const viewport = vi.hoisted(() => ({ isMobile: false }));
const navCounts = vi.hoisted(() => ({ cart: 0, activity: 0 }));
const catalogState = vi.hoisted(() => ({
  listings: [] as Array<{ id: string; title: string }>,
  isLoading: false,
}));

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
    listings: catalogState.listings,
    facetPool: catalogState.listings,
    shopsBySeller: new Map(),
    isLoading: catalogState.isLoading,
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
  MarketplaceListingCard: ({ listing }: { listing: { title: string } }) => <article>{listing.title}</article>,
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
    catalogState.listings = [];
    catalogState.isLoading = false;
    window.localStorage.clear();
  });

  it('renders guest catalog cards from server listings while the local cache hydrates', () => {
    catalogState.isLoading = true;

    render(
      <Marketplace
        initialListings={[
          {
            id: 'seller:boots_01',
            sellerId: 'y'.repeat(52),
            listingId: 'boots_01',
            state: 'active',
            title: 'Vintage leather boots',
            description: 'Well cared for boots with light wear.',
            categoryId: 'fashion-shoes-boots',
            condition: 'good',
            tags: ['vintage'],
            saleFormat: 'fixed_price',
            price: { amountMinor: 12_500, currency: 'USD', exponent: 2 },
            auction: null,
            attributes: null,
            location: { countryCode: 'US', region: 'NY' },
            mediaUrls: [],
            reputation: null,
            revision: 1,
            updatedAt: Date.parse('2026-08-19T21:00:00.000Z'),
          },
        ]}
      />,
    );

    expect(screen.getByRole('article')).toHaveTextContent('Vintage leather boots');
    expect(screen.getByRole('button', { name: 'Orders' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Seller studio' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Seller studio' }));

    expect(routerPush).toHaveBeenCalledWith(MARKETPLACE_ROUTES.DASHBOARD);
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
