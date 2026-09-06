import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import { Marketplace } from './Marketplace';

const routerPush = vi.hoisted(() => vi.fn());
const setSaleFormat = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ requireAuth: (action: () => void) => action() }),
}));

vi.mock('@/hooks/useMarketplaceCatalog/useMarketplaceCatalog', () => ({
  useMarketplaceCatalog: () => ({
    listings: [],
    facetPool: {},
    shopsBySeller: new Map(),
    isLoading: false,
    adapterMode: 'sandbox',
  }),
}));

vi.mock('@/hooks/useMarketplacePromoDismissal/useMarketplacePromoDismissal', () => ({
  useMarketplacePromoDismissal: () => ({ showPromo: false, dismissPromo: vi.fn() }),
}));

vi.mock('@/hooks/useMarketplaceWatchDetection/useMarketplaceWatchDetection', () => ({
  useMarketplaceWatchDetection: () => {},
}));

vi.mock('@/hooks/useMarketplaceCartCount/useMarketplaceCartCount', () => ({
  useMarketplaceCartCount: () => 0,
}));

vi.mock('@/hooks/useMarketplaceActivityUnread/useMarketplaceActivityUnread', () => ({
  useMarketplaceActivityUnread: () => 0,
}));

vi.mock('@/stores/commerce/commerce.store', () => ({
  useCommerceStore: (selector: (state: { layout: 'grid'; setSaleFormat: typeof setSaleFormat }) => unknown) =>
    selector({ layout: 'grid', setSaleFormat }),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/organisms/Marketplace/MarketplaceFilters', () => ({
  MarketplaceFilters: () => <div data-testid="marketplace-filters" />,
}));

vi.mock('@/organisms/Marketplace/MarketplaceListingCard', () => ({
  MarketplaceListingCard: () => <article />,
}));

describe('Marketplace', () => {
  beforeEach(() => {
    routerPush.mockClear();
    setSaleFormat.mockClear();
  });

  it('renders an Orders marketplace nav entry for a signed-in buyer', async () => {
    const user = userEvent.setup();

    render(<Marketplace />);

    await user.click(screen.getByRole('button', { name: 'Orders' }));

    expect(routerPush).toHaveBeenCalledWith(MARKETPLACE_ROUTES.ORDERS);
  });
});
