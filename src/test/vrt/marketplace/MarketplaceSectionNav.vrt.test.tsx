import { describe, expect, it, vi } from 'vitest';
import { MarketplaceSectionNav } from '@/organisms/Marketplace/MarketplaceSectionNav';
import { expectVrtSurface, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';

vi.mock('next/navigation', () => ({
  usePathname: () => '/marketplace/offers',
}));

vi.mock('@/hooks/useMarketplaceCartCount/useMarketplaceCartCount', () => ({
  useMarketplaceCartCount: () => 3,
}));

vi.mock('@/hooks/useMarketplaceActivityUnread/useMarketplaceActivityUnread', () => ({
  useMarketplaceActivityUnread: () => 2,
}));

describe('Marketplace section navigation — visual regression', () => {
  it('renders the active offers section and badges on desktop', async () => {
    await renderForVRT(
      <div className="w-full max-w-5xl p-6">
        <MarketplaceSectionNav />
      </div>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await expect(expectVrtSurface('marketplace-section-nav')).toMatchScreenshot('section-nav-offers-desktop');
  });

  it('renders the horizontally scrollable section navigation on mobile', async () => {
    await renderForVRT(
      <div className="w-full p-4">
        <MarketplaceSectionNav />
      </div>,
      { viewport: VRT_VIEWPORT_MOBILE },
    );
    await expect(expectVrtSurface('marketplace-section-nav')).toMatchScreenshot('section-nav-offers-mobile');
  });

  it('rejects a missing production surface marker', () => {
    expect(() => expectVrtSurface('wrong-marketplace-section-nav')).toThrow(
      'no production [data-surface="wrong-marketplace-section-nav"] root is mounted',
    );
  });
});
