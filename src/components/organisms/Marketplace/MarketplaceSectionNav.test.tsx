import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceSectionNav } from './MarketplaceSectionNav';

const state = vi.hoisted(() => ({
  pathname: '/marketplace/offers' as string | null,
  activityCount: 22,
  isAuthenticated: true,
}));
const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/hooks/useMarketplaceCartCount/useMarketplaceCartCount', () => ({
  useMarketplaceCartCount: () => 3,
}));

vi.mock('@/hooks/useMarketplaceActivityUnread/useMarketplaceActivityUnread', () => ({
  useMarketplaceActivityUnread: () => state.activityCount,
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: state.isAuthenticated,
    requireAuth: (action: () => void) => action(),
  }),
}));

describe('MarketplaceSectionNav', () => {
  beforeEach(() => {
    state.pathname = '/marketplace/offers';
    state.activityCount = 22;
    state.isAuthenticated = true;
    routerPush.mockClear();
  });

  it('highlights the active section and wires both badges', () => {
    render(<MarketplaceSectionNav />);

    expect(screen.getByRole('link', { name: 'Offers' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('marketplace-section-nav-cart-badge')).toHaveTextContent('3');
    expect(screen.getByTestId('marketplace-section-nav-activity-badge')).toHaveTextContent('21+');
  });

  it('highlights seller studio subroutes without highlighting buyer sections', () => {
    state.pathname = '/marketplace/sell';
    render(<MarketplaceSectionNav />);

    expect(screen.getByRole('link', { name: 'Seller studio' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Offers' })).not.toHaveAttribute('aria-current');
  });

  it('does not highlight a section while the pathname is unavailable', () => {
    state.pathname = null;
    render(<MarketplaceSectionNav />);

    expect(screen.getAllByRole('link')).toHaveLength(7);
    expect(screen.getAllByRole('link').every((link) => !link.hasAttribute('aria-current'))).toBe(true);
  });

  it('keeps the last item reachable when activity badges widen the row', () => {
    state.activityCount = 12;
    render(<MarketplaceSectionNav />);

    const nav = screen.getByTestId('marketplace-section-nav');
    expect(nav).toHaveClass('overflow-x-auto');
    expect(nav.firstElementChild).toHaveClass('min-w-max');
    expect(screen.getByRole('link', { name: 'Seller studio' })).toHaveClass('shrink-0');
    expect(screen.getByTestId('marketplace-section-nav-activity-badge')).toHaveTextContent('12');
  });

  it('routes signed-out home visitors through the auth gate', () => {
    state.isAuthenticated = false;
    render(<MarketplaceSectionNav requireAuthentication />);

    screen.getByRole('link', { name: 'Orders' }).click();

    expect(routerPush).toHaveBeenCalledWith('/marketplace/orders');
  });
});
