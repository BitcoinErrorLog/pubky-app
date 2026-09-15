import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceSectionNav } from './MarketplaceSectionNav';

const state = vi.hoisted(() => ({ pathname: '/marketplace/offers' as string | null }));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
}));

vi.mock('@/hooks/useMarketplaceCartCount/useMarketplaceCartCount', () => ({
  useMarketplaceCartCount: () => 3,
}));

vi.mock('@/hooks/useMarketplaceActivityUnread/useMarketplaceActivityUnread', () => ({
  useMarketplaceActivityUnread: () => 22,
}));

describe('MarketplaceSectionNav', () => {
  beforeEach(() => {
    state.pathname = '/marketplace/offers';
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
});
