// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';
import { MarketplaceSavedSearches } from '@/organisms/Marketplace/MarketplaceSavedSearches';

// The populated chips-with-NEW-badge state is covered inside the full
// Marketplace page baselines; this suite pins the organism's empty state and
// the inline naming flow.
const view = vi.hoisted(() => ({
  searches: [] as unknown[],
  isSignedIn: true,
}));

vi.mock('@/hooks/useMarketplaceSavedSearches/useMarketplaceSavedSearches', () => ({
  useMarketplaceSavedSearches: () => ({
    searches: view.searches,
    isSignedIn: view.isSignedIn,
    saveCurrentSearch: vi.fn(async () => true),
    applySearch: vi.fn(async () => {}),
    deleteSearch: vi.fn(async () => {}),
  }),
}));

describe('Marketplace saved searches — visual regression', () => {
  it('renders the empty state with the save affordance at desktop viewport', async () => {
    view.searches = [];

    const screen = await renderForVRT(
      <div className="mx-auto max-w-5xl p-6">
        <MarketplaceSavedSearches />
      </div>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('saved-searches-empty-desktop');
  });

  it('renders the inline naming form after choosing to save at desktop viewport', async () => {
    view.searches = [];

    const screen = await renderForVRT(
      <div className="mx-auto max-w-5xl p-6">
        <MarketplaceSavedSearches />
      </div>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await screen.getByRole('button', { name: 'Save current search' }).click();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('saved-searches-naming-desktop');
  });
});
