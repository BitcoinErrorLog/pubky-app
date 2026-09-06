import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getMarketplaceListingEditRoute } from '@/app/routes';
import { COMMERCE_FIXTURE_SELLER,createCommerceListingFixture } from '@/test/fixtures/commerce/commerce';
import { toCommerceListingModel } from '@/test/fixtures/commerce/listing-models';
import { MarketplaceDashboard } from './MarketplaceDashboard';

const viewport = vi.hoisted(() => ({ isMobile: false }));
const dashboardState = vi.hoisted(() => ({
  listings: [] as unknown[],
  metrics: {
    activeListings: 0,
    totalInventory: 0,
    lowStock: 0,
    paidOrders: 0,
    revenue: [] as unknown[],
    openOffers: 0,
  },
  actionNeeded: {
    ordersToShip: 0,
    offersAwaitingReply: 0,
    expiringAuctions: 0,
    total: 0,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => viewport.isMobile,
}));

vi.mock('@/hooks/useMarketplaceSellerDashboard/useMarketplaceSellerDashboard', () => ({
  useMarketplaceSellerDashboard: () => ({
    listings: dashboardState.listings,
    sellerOrders: [],
    offers: [],
    isLoading: false,
    needsSession: false,
    sessionError: null,
    metrics: dashboardState.metrics,
    actionNeeded: dashboardState.actionNeeded,
    updateListingState: vi.fn(async () => true),
    exportCsv: () => 'listing_id,title,state,format,price_minor,currency,inventory',
  }),
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => ({ record: { name: 'Satoshi Vintage' } }),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getShop: () => Promise.resolve({ record: { name: 'Satoshi Vintage' } }),
    getOrFetchShop: () => Promise.resolve({ name: 'Satoshi Vintage' }),
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: COMMERCE_FIXTURE_SELLER }),
}));

vi.mock('@/libs/commerce/media-url', () => ({
  resolveFirstMarketplaceMediaUrl: () => null,
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

describe('MarketplaceDashboard', () => {
  it('renders KPI metrics as a horizontal chip strip on mobile', () => {
    viewport.isMobile = true;
    dashboardState.listings = [listing()];
    dashboardState.metrics = {
      activeListings: 1,
      totalInventory: 4,
      lowStock: 0,
      paidOrders: 2,
      revenue: [{ amountMinor: 12_500, currency: 'USD', exponent: 2 }],
      openOffers: 1,
    };
    dashboardState.actionNeeded = {
      ordersToShip: 1,
      offersAwaitingReply: 0,
      expiringAuctions: 0,
      total: 1,
    };

    render(<MarketplaceDashboard />);

    const chips = screen.getByTestId('marketplace-dashboard-kpi-chips');
    expect(chips).toHaveTextContent('Active listings');
    expect(chips).toHaveTextContent('1');
    expect(chips).toHaveTextContent('$125.00');
    expect(screen.getByText('Action needed')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My listings' })).toBeInTheDocument();
  });

  it('keeps KPI cards on desktop', () => {
    viewport.isMobile = false;
    dashboardState.listings = [listing()];

    render(<MarketplaceDashboard />);

    expect(screen.queryByTestId('marketplace-dashboard-kpi-chips')).not.toBeInTheDocument();
    expect(screen.getByText('Active listings')).toBeInTheDocument();
  });

  it('renders a thumbnail placeholder and duplicate action target for listing rows', () => {
    viewport.isMobile = false;
    const rowListing = listing({ listingId: 'no_media', title: 'No media listing', media: [] });
    dashboardState.listings = [rowListing];

    render(<MarketplaceDashboard />);

    const row = screen.getByRole('row', { name: /No media listing/ });
    expect(within(row).getByLabelText('No thumbnail for No media listing')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /Duplicate/ })).toHaveAttribute(
      'href',
      `${getMarketplaceListingEditRoute(COMMERCE_FIXTURE_SELLER, 'no_media')}?duplicate=1`,
    );
  });
});

function listing(overrides: Partial<Parameters<typeof createCommerceListingFixture>[0]> = {}) {
  return toCommerceListingModel(createCommerceListingFixture(overrides));
}
