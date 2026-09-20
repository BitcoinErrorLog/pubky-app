import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceSectionNav } from './MarketplaceSectionNav';

const state = vi.hoisted(() => ({ pathname: '/marketplace/offers' as string | null, activityCount: 22 }));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
}));

vi.mock('@/hooks/useMarketplaceCartCount/useMarketplaceCartCount', () => ({
  useMarketplaceCartCount: () => 3,
}));

vi.mock('@/hooks/useMarketplaceActivityUnread/useMarketplaceActivityUnread', () => ({
  useMarketplaceActivityUnread: () => state.activityCount,
}));

describe('MarketplaceSectionNav', () => {
  beforeEach(() => {
    state.pathname = '/marketplace/offers';
    state.activityCount = 22;
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

    expect(screen.getAllByRole('link')).toHaveLength(8);
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

  it('delegates guarded home navigation without requiring an app router', () => {
    const onNavigate = vi.fn();
    render(<MarketplaceSectionNav onNavigate={onNavigate} />);

    screen.getByRole('link', { name: 'Orders' }).click();

    expect(onNavigate).toHaveBeenCalledWith('/marketplace/orders');
  });
});
