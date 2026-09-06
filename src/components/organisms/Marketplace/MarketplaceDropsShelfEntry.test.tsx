import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import { MarketplaceDropsShelfEntry } from './MarketplaceDropsShelfEntry';

const viewport = vi.hoisted(() => ({ isMobile: false }));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => viewport.isMobile,
}));

describe('MarketplaceDropsShelfEntry', () => {
  beforeEach(() => {
    viewport.isMobile = false;
  });

  it('renders the full desktop entry with the long tagline and Browse drops CTA', () => {
    render(<MarketplaceDropsShelfEntry />);

    const entry = screen.getByTestId('marketplace-drops-shelf-entry');
    expect(entry).toHaveAttribute('data-variant', 'desktop');
    expect(screen.getByRole('heading', { name: 'Drops' })).toBeInTheDocument();
    expect(screen.getByText(/server-enforced clock/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Browse drops/ })).toHaveAttribute('href', MARKETPLACE_ROUTES.DROPS);
    expect(screen.queryByRole('link', { name: 'Browse' })).not.toBeInTheDocument();
    expect(entry).not.toHaveClass('h-14');
  });

  it('renders a compact single row on mobile with a one-line tagline and Browse chevron', () => {
    viewport.isMobile = true;
    render(<MarketplaceDropsShelfEntry />);

    const entry = screen.getByTestId('marketplace-drops-shelf-entry');
    expect(entry).toHaveAttribute('data-variant', 'compact');
    expect(entry).toHaveClass('h-14');
    expect(entry).toHaveClass('max-h-14');
    expect(screen.getByRole('heading', { name: 'Drops' })).toBeInTheDocument();
    const tagline = screen.getByText('Timed, limited releases');
    expect(tagline).toHaveClass('truncate');
    expect(screen.queryByText(/no fake queues/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse' })).toHaveAttribute('href', MARKETPLACE_ROUTES.DROPS);
    expect(screen.queryByRole('link', { name: /Browse drops/ })).not.toBeInTheDocument();
  });
});
