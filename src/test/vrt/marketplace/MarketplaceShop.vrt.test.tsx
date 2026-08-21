// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplaceShop } from '@/templates/Marketplace/MarketplaceShop';

const fixtures = vi.hoisted(async () => {
  const { createCommerceListingFixture, createCommerceShopFixture, COMMERCE_FIXTURE_SELLER } =
    await import('@/test/fixtures/commerce/commerce');
  const { toCommerceListingModel, toCommerceShopModel } = await import('@/test/fixtures/commerce/listing-models');

  const listingEntry = (
    listingId: string,
    title: string,
    categoryId: string,
    amountMinor: number,
    colorHash: string,
    auction = false,
  ) =>
    toCommerceListingModel(
      createCommerceListingFixture({
        listingId,
        title,
        categoryId,
        media: [
          {
            id: `${listingId}_image`,
            type: 'image',
            url: `pubky://${COMMERCE_FIXTURE_SELLER}/pub/pubky.app/marketplace/v1/media/${listingId}_image`,
            contentHash: colorHash.repeat(64),
            mimeType: 'image/jpeg',
            byteSize: 10_000,
            width: 1_200,
            height: 1_600,
            altText: title,
          },
        ],
        sale: auction
          ? {
              format: 'auction',
              startingPrice: { amountMinor, currency: 'USD', exponent: 2 },
              minimumIncrement: { amountMinor: 500, currency: 'USD', exponent: 2 },
              startsAt: '2026-08-19T20:00:00.000Z',
              endsAt: '2026-08-29T20:00:00.000Z',
              antiSnipingWindowSeconds: 120,
              antiSnipingExtensionSeconds: 120,
            }
          : {
              format: 'fixed_price',
              unitPrice: { amountMinor, currency: 'USD', exponent: 2 },
              acceptsOffers: true,
            },
      }),
    );

  return {
    seller: COMMERCE_FIXTURE_SELLER,
    shop: toCommerceShopModel(createCommerceShopFixture()),
    vacationShop: toCommerceShopModel(createCommerceShopFixture({ vacationMode: true })),
    listings: [
      listingEntry('leather_boots', 'Vintage leather boots', 'fashion-shoes-boots', 12_500, 'a'),
      listingEntry('selvedge_jacket', 'Selvedge denim jacket', 'fashion-jackets', 8_900, 'b'),
      listingEntry('rangefinder_camera', '35mm rangefinder camera', 'electronics-cameras-film', 4_500, 'c', true),
      listingEntry('ceramic_vase', 'Hand-thrown ceramic vase', 'home-decor-ceramics', 6_400, 'd'),
    ],
  };
});

const view = vi.hoisted(() => ({
  shop: undefined as unknown,
  listings: undefined as unknown,
  catalogEntries: undefined as unknown,
  shopTags: [] as unknown[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace',
}));

// The community-tags hook uses an async live-query, so a synchronous
// passthrough would surface a Promise. Unwrap into state; the browser-mode
// render waits (fonts, images, rAF) long enough for the settle to paint.
vi.mock('dexie-react-hooks', async () => {
  const { useEffect, useState } = await import('react');
  return {
    useLiveQuery: (querier: () => unknown, deps: unknown[] = [], defaultValue?: unknown) => {
      const [value, setValue] = useState(defaultValue);
      useEffect(() => {
        let stale = false;
        Promise.resolve(querier()).then((result) => {
          if (!stale) setValue(result);
        });
        return () => {
          stale = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror useLiveQuery's deps contract
      }, deps);
      return value;
    },
  };
});

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getShop: () => view.shop,
    getListingsBySeller: () => view.listings,
    getCatalogEntriesBySeller: () => view.catalogEntries,
    getShopTags: () => view.shopTags,
    fetchShopTags: () => Promise.resolve([]),
  },
}));

vi.mock('@/hooks/useCommerceShopFollow/useCommerceShopFollow', () => ({
  useCommerceShopFollow: () => ({ isFollowing: false, isMutating: false, toggle: vi.fn() }),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string; setShowSignInDialog: () => void }) => unknown) =>
    selector({ currentUserPubky: 'u'.repeat(52), setShowSignInDialog: vi.fn() }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ isAuthenticated: true, requireAuth: (action: () => void) => action() }),
}));

// Pass tags through unchanged: enrichment reads user details from the local
// DB, which VRT deliberately does not exercise.
vi.mock('@/hooks/useEnrichedTags/useEnrichedTags', () => ({
  useEnrichedTags: (tags: unknown[]) => ({ enrichedTags: tags, isLoading: false }),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main className="w-full py-6">{children}</main>,
}));

describe('Marketplace shop — visual regression', () => {
  it('renders a populated shop at desktop viewport', async () => {
    const { seller, shop, listings } = await fixtures;
    view.shop = shop;
    view.listings = listings;
    view.catalogEntries = [];

    const screen = await renderForVRT(<MarketplaceShop sellerPubky={seller} />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('shop-populated-desktop');
  });

  it('renders a populated shop at mobile viewport', async () => {
    const { seller, shop, listings } = await fixtures;
    view.shop = shop;
    view.listings = listings;
    view.catalogEntries = [];

    const screen = await renderForVRT(<MarketplaceShop sellerPubky={seller} />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('shop-populated-mobile');
  });

  it('renders shop community tags at desktop viewport', async () => {
    const { seller, shop, listings } = await fixtures;
    view.shop = shop;
    view.listings = listings;
    view.catalogEntries = [];
    view.shopTags = [
      { label: 'trusted', taggers: ['t'.repeat(52), 'v'.repeat(52)], taggers_count: 2, relationship: true },
      { label: 'fast-shipping', taggers: ['w'.repeat(52)], taggers_count: 1, relationship: false },
    ];

    const screen = await renderForVRT(<MarketplaceShop sellerPubky={seller} />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('shop-community-tags-desktop');
    view.shopTags = [];
  });

  it('renders a shop in vacation mode at desktop viewport', async () => {
    const { seller, vacationShop, listings } = await fixtures;
    view.shop = vacationShop;
    view.listings = listings;
    view.catalogEntries = [];

    const screen = await renderForVRT(<MarketplaceShop sellerPubky={seller} />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('shop-vacation-mode-desktop');
  });

  it('renders a shop with no listings at desktop viewport', async () => {
    const { seller, shop } = await fixtures;
    view.shop = shop;
    view.listings = [];
    view.catalogEntries = [];

    const screen = await renderForVRT(<MarketplaceShop sellerPubky={seller} />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('shop-no-listings-desktop');
  });

  it('renders the loading skeleton at desktop viewport', async () => {
    const { seller } = await fixtures;
    view.shop = undefined;
    view.listings = undefined;
    view.catalogEntries = undefined;

    const screen = await renderForVRT(<MarketplaceShop sellerPubky={seller} />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('shop-loading-desktop');
  });

  it('renders the unavailable state at desktop viewport', async () => {
    const { seller } = await fixtures;
    view.shop = null;
    view.listings = [];
    view.catalogEntries = [];

    const screen = await renderForVRT(<MarketplaceShop sellerPubky={seller} />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('shop-unavailable-desktop');
  });
});
