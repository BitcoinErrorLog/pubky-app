// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplaceModeration } from '@/templates/Marketplace/MarketplaceModeration';

// Covers every report reason defined by the report schema union (the fixture
// sweep also cycles through every target type), split so each reason is
// visible, plus the empty queue and the non-moderator error view.
const fixtures = vi.hoisted(async () => {
  const { createReportsForEveryReason } = await import('@/test/fixtures/commerce/reports');
  const everyReason = createReportsForEveryReason();
  return {
    reasonsFirstHalf: everyReason.slice(0, 3),
    reasonsSecondHalf: everyReason.slice(3),
  };
});

const view = vi.hoisted(() => ({
  reports: [] as unknown[],
  isLoading: false,
  error: null as string | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace/moderation',
}));

vi.mock('@/hooks/useMarketplaceModeration/useMarketplaceModeration', () => ({
  useMarketplaceModeration: () => ({
    reports: view.reports,
    isLoading: view.isLoading,
    error: view.error,
  }),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main className="w-full py-6">{children}</main>,
}));

describe('Marketplace moderation queue — visual regression', () => {
  it('renders the first half of every report reason at desktop viewport', async () => {
    const { reasonsFirstHalf } = await fixtures;
    view.reports = reasonsFirstHalf;
    view.isLoading = false;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-reasons-1-desktop');
  });

  it('renders the first half of every report reason at mobile viewport', async () => {
    const { reasonsFirstHalf } = await fixtures;
    view.reports = reasonsFirstHalf;
    view.isLoading = false;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-reasons-1-mobile');
  });

  it('renders the second half of every report reason at desktop viewport', async () => {
    const { reasonsSecondHalf } = await fixtures;
    view.reports = reasonsSecondHalf;
    view.isLoading = false;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-reasons-2-desktop');
  });

  it('renders the empty queue at desktop viewport', async () => {
    view.reports = [];
    view.isLoading = false;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-empty-desktop');
  });

  it('renders the non-moderator view at desktop viewport', async () => {
    view.reports = [];
    view.isLoading = false;
    view.error = 'This account does not have marketplace moderator access.';

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-unauthorized-desktop');
  });

  it('renders the loading state at desktop viewport', async () => {
    view.reports = [];
    view.isLoading = true;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceModeration />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('moderation-loading-desktop');
  });
});
