// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplaceListing } from '@/templates/Marketplace/MarketplaceListing';

// Record media resolves to a deterministic data-URI image so the gallery
// captures a REAL loaded image (main viewer + thumbnails) without any network
// fetch — the fixture pubky:// URIs have no fetchable bytes in VRT.
const MEDIA_DATA_URL = vi.hoisted(
  () =>
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGN4UaKEFTEMLQkAgnNfgXMIh2kAAAAASUVORK5CYII=',
);

vi.mock('@/libs/commerce/media-url', () => ({
  resolveMarketplaceMediaUrl: (uri: string) => (uri ? MEDIA_DATA_URL : null),
  resolveFirstMarketplaceMediaUrl: (uris: readonly string[]) => (uris.length > 0 ? MEDIA_DATA_URL : null),
}));

const fixtures = vi.hoisted(async () => {
  const { createCommerceListingFixture, createCommerceShopFixture, COMMERCE_FIXTURE_SELLER } =
    await import('@/test/fixtures/commerce/commerce');
  const { toCommerceListingModel, toCommerceShopModel } = await import('@/test/fixtures/commerce/listing-models');
  const { createAuctionProjectionFixture, createListingProjectionFixture } =
    await import('@/test/fixtures/commerce/projections');

  const seller = COMMERCE_FIXTURE_SELLER;
  const twoVariants = (quantity: number) => [
    { id: 'variant_42', options: { size: '42' }, quantity, mediaIds: ['image_01'], enabled: true },
    { id: 'variant_43', options: { size: '43' }, quantity, mediaIds: ['image_01'], enabled: true },
  ];
  const galleryImage = (id: string, altText: string) => ({
    id,
    type: 'image' as const,
    url: `pubky://${seller}/pub/pubky.app/marketplace/v1/media/${id}`,
    contentHash: 'c'.repeat(64),
    mimeType: 'image/jpeg',
    byteSize: 10_000,
    width: 1_200,
    height: 1_600,
    altText,
  });

  return {
    galleryListing: toCommerceListingModel(
      createCommerceListingFixture({
        media: [
          galleryImage('image_01', 'Front view'),
          galleryImage('image_02', 'Sole view'),
          galleryImage('image_03', 'Detail view'),
        ],
      }),
    ),
    seller,
    shop: toCommerceShopModel(createCommerceShopFixture()),
    fixedPriceListing: toCommerceListingModel(createCommerceListingFixture({ variants: twoVariants(2) })),
    soldOutListing: toCommerceListingModel(createCommerceListingFixture({ variants: twoVariants(0) })),
    auctionListing: toCommerceListingModel(
      createCommerceListingFixture({
        listingId: 'rangefinder_camera',
        title: '35mm rangefinder camera',
        description: 'Recently serviced mechanical rangefinder with bright optics.',
        categoryId: 'electronics-cameras-film',
        condition: 'excellent',
        tags: ['film', 'camera'],
        sale: {
          format: 'auction',
          startingPrice: { amountMinor: 4_500, currency: 'USD', exponent: 2 },
          reservePrice: { amountMinor: 6_500, currency: 'USD', exponent: 2 },
          minimumIncrement: { amountMinor: 500, currency: 'USD', exponent: 2 },
          startsAt: '2026-08-19T20:00:00.000Z',
          endsAt: '2026-08-29T20:00:00.000Z',
          antiSnipingWindowSeconds: 120,
          antiSnipingExtensionSeconds: 120,
        },
      }),
    ),
    digitalListing: toCommerceListingModel(
      createCommerceListingFixture({
        listingId: 'field_recordings',
        title: 'Field recordings archive (digital)',
        description: 'Locks-gated download of a 24-bit field recording collection.',
        categoryId: 'collectibles-music-vinyl',
        condition: 'new',
        tags: ['digital', 'audio'],
        fulfillmentMethods: ['digital'],
        digitalLock: {
          policyUri: `pubky://${seller}/pub/locks.app/policies/field_recordings.json`,
          criterionId: 'criterion-1',
          contentPath: 'field_recordings/archive.zip',
          resourceHash: 'a'.repeat(64),
          minimumConfirmations: 3,
        },
      }),
    ),
    pausedListing: toCommerceListingModel(createCommerceListingFixture({ state: 'paused' })),
    vacationShop: toCommerceShopModel(createCommerceShopFixture({ vacationMode: true })),
    fixedPriceProjection: createListingProjectionFixture(),
    auctionProjection: createAuctionProjectionFixture(),
  };
});

const view = vi.hoisted(() => ({
  adapterMode: 'sandbox' as 'sandbox' | 'unavailable' | 'locks-paykit',
  listing: undefined as unknown,
  shop: undefined as unknown,
  projection: null as unknown,
  fetchFails: false,
  currentUserPubky: 'u'.repeat(52),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace',
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ requireAuth: (action: () => void) => action() }),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: view.currentUserPubky }),
}));

vi.mock('@/config/commerce', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/commerce')>();
  return { ...actual, getCommerceAdapterMode: () => view.adapterMode };
});

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (querier: () => unknown) => querier(),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getListing: () => view.listing,
    getShop: () => view.shop,
    getOrFetchListing: () => (view.fetchFails ? Promise.reject(new Error('offline')) : Promise.resolve(null)),
  },
}));

vi.mock('@/hooks/useCommerceFavorite/useCommerceFavorite', () => ({
  useCommerceFavorite: () => ({ isFavorite: false, isMutating: false, toggle: vi.fn() }),
}));

vi.mock('@/hooks/useMarketplaceCart/useMarketplaceCart', () => ({
  useMarketplaceCart: () => ({
    items: [],
    itemCount: 0,
    subtotalMinor: 0,
    isLoading: false,
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock('@/hooks/useMarketplaceProjection/useMarketplaceProjection', () => ({
  useMarketplaceProjection: () => ({ projection: view.projection, isLoading: false, error: null, refresh: vi.fn() }),
}));

vi.mock('@/hooks/useMarketplaceMessages/useMarketplaceMessages', async () => {
  const { useForm } = await import('react-hook-form');
  const { marketplaceMessageDefaults } = await import('@/hooks/useMarketplaceMessages/useMarketplaceMessages.types');
  return {
    useMarketplaceMessages: () => ({
      form: useForm({ defaultValues: marketplaceMessageDefaults }),
      conversation: null,
      isLoading: false,
      error: null,
      isSandbox: view.adapterMode === 'sandbox',
      attachment: {
        file: null,
        previewUrl: null,
        error: null,
        inputRef: { current: null },
        onInputChange: vi.fn(),
        choose: vi.fn(),
        remove: vi.fn(),
        reset: vi.fn(),
        upload: vi.fn(),
      },
      submit: vi.fn(async () => false),
      refresh: vi.fn(async () => {}),
    }),
  };
});

vi.mock('@/hooks/useMarketplaceReport/useMarketplaceReport', async () => {
  const { useForm } = await import('react-hook-form');
  const { marketplaceReportDefaults } = await import('@/hooks/useMarketplaceReport/useMarketplaceReport.types');
  return {
    useMarketplaceReport: () => ({
      form: useForm({ defaultValues: marketplaceReportDefaults }),
      submit: vi.fn(async () => false),
    }),
  };
});

vi.mock('@/hooks/useMarketplaceBid/useMarketplaceBid', async () => {
  const { useForm } = await import('react-hook-form');
  const { marketplaceBidDefaults } = await import('@/hooks/useMarketplaceBid/useMarketplaceBid.types');
  return {
    useMarketplaceBid: () => ({
      form: useForm({ defaultValues: marketplaceBidDefaults }),
      submit: vi.fn(async () => false),
      reset: vi.fn(),
    }),
  };
});

vi.mock('@/hooks/useMarketplaceOffer/useMarketplaceOffer', async () => {
  const { useForm } = await import('react-hook-form');
  const { marketplaceOfferDefaults } = await import('@/hooks/useMarketplaceOffer/useMarketplaceOffer.types');
  return {
    useMarketplaceOffer: () => ({
      form: useForm({ defaultValues: marketplaceOfferDefaults }),
      submit: vi.fn(async () => false),
      reset: vi.fn(),
    }),
  };
});

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main className="w-full py-6">{children}</main>,
}));

async function setView(overrides: Partial<typeof view>) {
  const { shop } = await fixtures;
  view.adapterMode = 'sandbox';
  view.listing = undefined;
  view.shop = shop;
  view.projection = null;
  view.fetchFails = false;
  view.currentUserPubky = 'u'.repeat(52);
  Object.assign(view, overrides);
}

describe('Marketplace listing detail — visual regression', () => {
  it('renders a fixed-price listing at desktop viewport', async () => {
    const { seller, fixedPriceListing, fixedPriceProjection } = await fixtures;
    await setView({ listing: fixedPriceListing, projection: fixedPriceProjection });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="boots_01" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-fixed-price-desktop');
  });

  it('renders the media gallery with a main image and thumbnail strip at desktop viewport', async () => {
    const { seller, galleryListing, fixedPriceProjection } = await fixtures;
    await setView({ listing: galleryListing, projection: fixedPriceProjection });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="boots_01" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-media-gallery-desktop');
  });

  it('renders a fixed-price listing at mobile viewport', async () => {
    const { seller, fixedPriceListing, fixedPriceProjection } = await fixtures;
    await setView({ listing: fixedPriceListing, projection: fixedPriceProjection });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="boots_01" />, {
      viewport: VRT_VIEWPORT_MOBILE,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-fixed-price-mobile');
  });

  it('renders an auction listing with live bid state at desktop viewport', async () => {
    const { seller, auctionListing, auctionProjection } = await fixtures;
    await setView({ listing: auctionListing, projection: auctionProjection });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="rangefinder_camera" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-auction-desktop');
  });

  it('renders a digital listing with a Locks lock at desktop viewport', async () => {
    const { seller, digitalListing, fixedPriceProjection } = await fixtures;
    await setView({ listing: digitalListing, projection: fixedPriceProjection });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="field_recordings" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-digital-locks-desktop');
  });

  // In locks-paykit mode the digital-delivery notice describes the REAL
  // post-checkout wallet flow instead of the fail-closed unavailability note
  // covered by the scenario above (non-locks-paykit modes).
  it('renders a digital listing with the live payment-rails notice at desktop viewport', async () => {
    const { seller, digitalListing, fixedPriceProjection } = await fixtures;
    await setView({ listing: digitalListing, projection: fixedPriceProjection, adapterMode: 'locks-paykit' });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="field_recordings" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-digital-locks-paykit-desktop');
  });

  it('renders a sold-out listing at desktop viewport', async () => {
    const { seller, soldOutListing, fixedPriceProjection } = await fixtures;
    await setView({ listing: soldOutListing, projection: fixedPriceProjection });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="boots_01" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-sold-out-desktop');
  });

  it('renders the seller-owned listing with the management panel at desktop viewport', async () => {
    const { seller, fixedPriceListing, fixedPriceProjection } = await fixtures;
    await setView({ listing: fixedPriceListing, projection: fixedPriceProjection, currentUserPubky: seller });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="boots_01" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-owner-panel-desktop');
  });

  it('renders the owner set-up-your-shop prompt when no shop record exists at desktop viewport', async () => {
    const { seller, fixedPriceListing, fixedPriceProjection } = await fixtures;
    await setView({
      listing: fixedPriceListing,
      projection: fixedPriceProjection,
      currentUserPubky: seller,
      shop: null,
    });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="boots_01" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-owner-no-shop-desktop');
  });

  it('renders an unlisted (paused) listing for a visitor at desktop viewport', async () => {
    const { seller, pausedListing, fixedPriceProjection } = await fixtures;
    await setView({ listing: pausedListing, projection: fixedPriceProjection });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="boots_01" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-unlisted-desktop');
  });

  it('renders the seller-on-vacation badge at desktop viewport', async () => {
    const { seller, fixedPriceListing, vacationShop, fixedPriceProjection } = await fixtures;
    await setView({ listing: fixedPriceListing, projection: fixedPriceProjection, shop: vacationShop });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="boots_01" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-vacation-desktop');
  });

  it('renders the unavailable state at desktop viewport', async () => {
    const { seller } = await fixtures;
    await setView({ listing: null, shop: null });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="gone_listing" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-unavailable-desktop');
  });

  it('renders the load-error state at desktop viewport', async () => {
    const { seller } = await fixtures;
    await setView({ adapterMode: 'locks-paykit', listing: null, shop: null, fetchFails: true });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="broken_listing" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-error-desktop');
  });

  it('renders the loading skeleton at desktop viewport', async () => {
    const { seller } = await fixtures;
    await setView({ listing: undefined, shop: undefined });

    const screen = await renderForVRT(<MarketplaceListing sellerPubky={seller} listingId="boots_01" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('listing-loading-desktop');
  });
});
