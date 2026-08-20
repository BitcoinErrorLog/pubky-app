// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplaceFilters } from '@/organisms/Marketplace/MarketplaceFilters';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import { commerceInitialState, type CommerceState } from '@/stores/commerce/commerce.types';

function setStoreState(overrides: Partial<CommerceState> = {}) {
  useCommerceStore.setState({ ...commerceInitialState, ...overrides });
}

function FiltersHarness({ resultCount }: { resultCount: number }) {
  return (
    <main className="w-full px-6 py-6">
      <MarketplaceFilters resultCount={resultCount} />
    </main>
  );
}

describe('Marketplace filters — visual regression', () => {
  it('renders the default filter bar at desktop viewport', async () => {
    setStoreState();

    const screen = await renderForVRT(<FiltersHarness resultCount={8} />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('filters-default-desktop');
  });

  it('renders the default filter bar at mobile viewport', async () => {
    setStoreState();

    const screen = await renderForVRT(<FiltersHarness resultCount={8} />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('filters-default-mobile');
  });

  it('renders applied filters with the clear action at desktop viewport', async () => {
    setStoreState({ query: 'boots', categoryId: 'fashion', saleFormat: 'fixed_price', sort: 'price_low' });

    const screen = await renderForVRT(<FiltersHarness resultCount={3} />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('filters-applied-desktop');
  });

  it('renders the list layout toggle selected at desktop viewport', async () => {
    setStoreState({ layout: 'list' });

    const screen = await renderForVRT(<FiltersHarness resultCount={8} />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('filters-list-layout-desktop');
  });

  it('renders the zero-results emphasis at desktop viewport', async () => {
    setStoreState({ query: 'no matches expected', saleFormat: 'auction' });

    const screen = await renderForVRT(<FiltersHarness resultCount={0} />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('filters-zero-results-desktop');
  });
});
