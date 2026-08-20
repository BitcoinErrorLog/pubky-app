// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplaceDashboard } from '@/templates/Marketplace/MarketplaceDashboard';

const fixtures = vi.hoisted(async () => {
  const { createCommerceListingFixture } = await import('@/test/fixtures/commerce/commerce');
  const { toCommerceListingModel } = await import('@/test/fixtures/commerce/listing-models');

  const listings = [
    toCommerceListingModel(
      createCommerceListingFixture({
        variants: [
          { id: 'variant_42', options: { size: '42' }, quantity: 3, mediaIds: ['image_01'], enabled: true },
          { id: 'variant_43', options: { size: '43' }, quantity: 1, mediaIds: ['image_01'], enabled: true },
        ],
      }),
    ),
    toCommerceListingModel(
      createCommerceListingFixture({
        listingId: 'selvedge_jacket',
        title: 'Selvedge denim jacket',
        categoryId: 'fashion-jackets',
        sale: {
          format: 'fixed_price',
          unitPrice: { amountMinor: 8_900, currency: 'USD', exponent: 2 },
          acceptsOffers: true,
        },
      }),
    ),
    toCommerceListingModel(
      createCommerceListingFixture({
        listingId: 'rangefinder_camera',
        title: '35mm rangefinder camera',
        categoryId: 'electronics-cameras-film',
        sale: {
          format: 'auction',
          startingPrice: { amountMinor: 4_500, currency: 'USD', exponent: 2 },
          minimumIncrement: { amountMinor: 500, currency: 'USD', exponent: 2 },
          startsAt: '2026-08-19T20:00:00.000Z',
          endsAt: '2026-08-29T20:00:00.000Z',
          antiSnipingWindowSeconds: 120,
          antiSnipingExtensionSeconds: 120,
        },
      }),
    ),
    toCommerceListingModel(createCommerceListingFixture({ listingId: 'paused_boots', state: 'paused' })),
  ];

  return {
    listings,
    populatedMetrics: {
      activeListings: 3,
      totalInventory: 6,
      lowStock: 2,
      paidOrders: 4,
      revenueMinor: 51_300,
      openOffers: 2,
    },
    emptyMetrics: {
      activeListings: 0,
      totalInventory: 0,
      lowStock: 0,
      paidOrders: 0,
      revenueMinor: 0,
      openOffers: 0,
    },
  };
});

const view = vi.hoisted(() => ({
  listings: [] as unknown[],
  metrics: {} as unknown,
  isLoading: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace/dashboard',
}));

vi.mock('@/hooks/useMarketplaceSellerDashboard/useMarketplaceSellerDashboard', () => ({
  useMarketplaceSellerDashboard: () => ({
    listings: view.listings,
    sellerOrders: [],
    offers: [],
    isLoading: view.isLoading,
    metrics: view.metrics,
    updateListingState: vi.fn(async () => false),
    exportCsv: () => 'listing_id,title,state,format,price_minor,currency,inventory',
  }),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main className="w-full py-6">{children}</main>,
}));

describe('Marketplace seller dashboard — visual regression', () => {
  it('renders populated metrics and inventory at desktop viewport', async () => {
    const { listings, populatedMetrics } = await fixtures;
    view.listings = listings;
    view.metrics = populatedMetrics;
    view.isLoading = false;

    const screen = await renderForVRT(<MarketplaceDashboard />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('dashboard-populated-desktop');
  });

  it('renders populated metrics and inventory at mobile viewport', async () => {
    const { listings, populatedMetrics } = await fixtures;
    view.listings = listings;
    view.metrics = populatedMetrics;
    view.isLoading = false;

    const screen = await renderForVRT(<MarketplaceDashboard />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('dashboard-populated-mobile');
  });

  it('renders the new-seller empty state at desktop viewport', async () => {
    const { emptyMetrics } = await fixtures;
    view.listings = [];
    view.metrics = emptyMetrics;
    view.isLoading = false;

    const screen = await renderForVRT(<MarketplaceDashboard />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('dashboard-empty-desktop');
  });

  it('renders the loading state at desktop viewport', async () => {
    const { emptyMetrics } = await fixtures;
    view.listings = [];
    view.metrics = emptyMetrics;
    view.isLoading = true;

    const screen = await renderForVRT(<MarketplaceDashboard />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('dashboard-loading-desktop');
  });
});
