// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { Marketplace } from '@/templates/Marketplace/Marketplace';

const fixtures = vi.hoisted(async () => {
  const { createCommerceSandboxCatalog } = await import('@/libs/commerce/sandbox-catalog');
  const catalog = createCommerceSandboxCatalog();
  const listings = catalog.listings.map((record) => {
    const price = record.sale.format === 'fixed_price' ? record.sale.unitPrice : record.sale.startingPrice;
    return {
      id: `${record.ownerPubky}:${record.listingId}`,
      seller_id: record.ownerPubky,
      listing_id: record.listingId,
      record,
      revision: record.revision,
      state: record.state,
      category_id: record.categoryId,
      format: record.sale.format,
      currency: price.currency,
      price_minor: price.amountMinor,
      sync_status: 'synced' as const,
      updated_at: Date.parse(record.updatedAt),
    };
  });
  return {
    listings,
    shopsBySeller: new Map(catalog.shops.map((shop) => [shop.ownerPubky, shop])),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace',
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ requireAuth: (action: () => void) => action() }),
}));

vi.mock('@/hooks/useMarketplaceCatalog/useMarketplaceCatalog', async () => {
  const catalog = await fixtures;
  return {
    useMarketplaceCatalog: () => ({
      listings: catalog.listings,
      shopsBySeller: catalog.shopsBySeller,
      isLoading: false,
      adapterMode: 'sandbox',
    }),
  };
});

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main className="w-full py-6">{children}</main>,
}));

describe('Marketplace — visual regression', () => {
  it('renders the sandbox catalog at desktop viewport', async () => {
    const screen = await renderForVRT(<Marketplace />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('marketplace-desktop');
  });

  it('renders the sandbox catalog at mobile viewport', async () => {
    const screen = await renderForVRT(<Marketplace />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('marketplace-mobile');
  });
});
