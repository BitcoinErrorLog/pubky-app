// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplaceCart } from '@/templates/Marketplace/MarketplaceCart';

const fixtures = vi.hoisted(async () => {
  const { createCommerceListingFixture } = await import('@/test/fixtures/commerce/commerce');
  const { toCommerceListingModel } = await import('@/test/fixtures/commerce/listing-models');

  const otherSeller = 'n'.repeat(52);
  const boots = toCommerceListingModel(
    createCommerceListingFixture({
      variants: [
        { id: 'variant_42', options: { size: '42' }, quantity: 3, mediaIds: ['image_01'], enabled: true },
        { id: 'variant_43', options: { size: '43' }, quantity: 1, mediaIds: ['image_01'], enabled: true },
      ],
    }),
  );
  const jacket = toCommerceListingModel(
    createCommerceListingFixture({
      listingId: 'selvedge_jacket',
      title: 'Selvedge denim jacket',
      categoryId: 'fashion-jackets',
      condition: 'excellent',
      variants: [{ id: 'variant_01', options: { size: 'M' }, quantity: 2, mediaIds: ['image_01'], enabled: true }],
      sale: {
        format: 'fixed_price',
        unitPrice: { amountMinor: 8_900, currency: 'USD', exponent: 2 },
        acceptsOffers: true,
      },
    }),
  );
  const camera = toCommerceListingModel(
    createCommerceListingFixture({
      ownerPubky: otherSeller,
      listingId: 'rangefinder_camera',
      title: '35mm rangefinder camera',
      categoryId: 'electronics-cameras-film',
      condition: 'excellent',
      variants: [{ id: 'variant_01', options: {}, quantity: 1, mediaIds: ['image_01'], enabled: true }],
      sale: {
        format: 'fixed_price',
        unitPrice: { amountMinor: 4_500, currency: 'USD', exponent: 2 },
        acceptsOffers: false,
      },
    }),
  );

  const item = (listing: ReturnType<typeof toCommerceListingModel>, variantId: string, quantity: number) => ({
    id: `${listing.id}:${variantId}`,
    listingId: listing.id,
    variantId,
    quantity,
    listing,
  });

  return {
    singleSeller: [item(boots, 'variant_42', 1), item(boots, 'variant_43', 1)],
    multiSeller: [item(boots, 'variant_42', 2), item(jacket, 'variant_01', 1), item(camera, 'variant_01', 1)],
    staleItem: [item(boots, 'variant_42', 1), item(jacket, 'variant_gone', 1)],
  };
});

interface CartItemLike {
  quantity: number;
  variantId: string;
  listing: {
    record: {
      variants: Array<{ id: string; priceOverride?: { amountMinor: number } }>;
      sale: { format: string; unitPrice?: { amountMinor: number } };
    };
  };
}

const view = vi.hoisted(() => ({
  items: [] as unknown[],
  isLoading: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace/cart',
}));

vi.mock('@/hooks/useMarketplaceCart/useMarketplaceCart', () => ({
  useMarketplaceCart: () => {
    const items = view.items as CartItemLike[];
    return {
      items,
      itemCount: items.reduce((total, item) => total + item.quantity, 0),
      subtotalMinor: items.reduce((total, item) => {
        const variant = item.listing.record.variants.find(({ id }) => id === item.variantId);
        const price =
          variant?.priceOverride ??
          (item.listing.record.sale.format === 'fixed_price' ? item.listing.record.sale.unitPrice : null);
        return total + (price?.amountMinor ?? 0) * item.quantity;
      }, 0),
      isLoading: view.isLoading,
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    };
  },
}));

vi.mock('@/hooks/useMarketplaceCheckout/useMarketplaceCheckout', async () => {
  const { useForm } = await import('react-hook-form');
  const { marketplaceCheckoutDefaults } = await import('@/hooks/useMarketplaceCheckout/useMarketplaceCheckout.types');
  return {
    useMarketplaceCheckout: () => ({
      form: useForm({ defaultValues: marketplaceCheckoutDefaults }),
      submit: vi.fn(async () => false),
    }),
  };
});

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main className="w-full py-6">{children}</main>,
}));

describe('Marketplace cart — visual regression', () => {
  it('renders a single-seller cart at desktop viewport', async () => {
    const { singleSeller } = await fixtures;
    view.items = singleSeller;
    view.isLoading = false;

    const screen = await renderForVRT(<MarketplaceCart />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('cart-single-seller-desktop');
  });

  it('renders a single-seller cart at mobile viewport', async () => {
    const { singleSeller } = await fixtures;
    view.items = singleSeller;
    view.isLoading = false;

    const screen = await renderForVRT(<MarketplaceCart />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('cart-single-seller-mobile');
  });

  it('renders a multi-seller cart at desktop viewport', async () => {
    const { multiSeller } = await fixtures;
    view.items = multiSeller;
    view.isLoading = false;

    const screen = await renderForVRT(<MarketplaceCart />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('cart-multi-seller-desktop');
  });

  it('renders a cart with a stale item whose variant is gone at desktop viewport', async () => {
    const { staleItem } = await fixtures;
    view.items = staleItem;
    view.isLoading = false;

    const screen = await renderForVRT(<MarketplaceCart />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('cart-stale-item-desktop');
  });

  it('renders the empty cart at desktop viewport', async () => {
    view.items = [];
    view.isLoading = false;

    const screen = await renderForVRT(<MarketplaceCart />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('cart-empty-desktop');
  });

  it('renders the loading state at desktop viewport', async () => {
    view.items = [];
    view.isLoading = true;

    const screen = await renderForVRT(<MarketplaceCart />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('cart-loading-desktop');
  });
});
