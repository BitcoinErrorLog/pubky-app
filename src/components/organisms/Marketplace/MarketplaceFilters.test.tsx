import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import { MarketplaceFilters } from './MarketplaceFilters';

describe('MarketplaceFilters', () => {
  beforeEach(() => {
    useCommerceStore.getState().reset();
  });

  it('updates search, category, and layout UI state accessibly', async () => {
    const user = userEvent.setup();
    render(<MarketplaceFilters resultCount={8} />);

    await user.type(screen.getByRole('textbox', { name: 'Search marketplace' }), 'boots');
    await user.click(screen.getByRole('button', { name: 'Fashion' }));
    await user.click(screen.getByRole('button', { name: 'List view' }));

    expect(useCommerceStore.getState()).toMatchObject({
      query: 'boots',
      categoryId: 'fashion',
      layout: 'list',
    });
    expect(screen.getByText('8 items')).toHaveAttribute('aria-live', 'polite');
  });

  it('exposes the active category and layout as pressed toggles', async () => {
    const user = userEvent.setup();
    render(<MarketplaceFilters resultCount={8} />);

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Fashion' }));
    expect(screen.getByRole('button', { name: 'Fashion' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');

    expect(screen.getByRole('group', { name: 'Listing layout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clears active discovery filters without changing layout', async () => {
    const user = userEvent.setup();
    useCommerceStore.getState().setLayout('list');
    useCommerceStore.getState().setQuery('camera');
    useCommerceStore.getState().setCategoryId('fashion');
    useCommerceStore.getState().setAttributeFilter('size', 'L');
    render(<MarketplaceFilters resultCount={1} />);

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(useCommerceStore.getState()).toMatchObject({
      query: '',
      categoryId: null,
      attributeFilters: {},
      saleFormat: 'all',
      layout: 'list',
    });
  });

  it('drills into the category tree via breadcrumb and child chips', async () => {
    const user = userEvent.setup();
    render(<MarketplaceFilters resultCount={8} />);

    await user.click(screen.getByRole('button', { name: 'Fashion' }));
    expect(useCommerceStore.getState().categoryId).toBe('fashion');
    // Children of the selected node appear as chips.
    await user.click(screen.getByRole('button', { name: 'Men' }));
    expect(useCommerceStore.getState().categoryId).toBe('fashion-men');
    await user.click(screen.getByRole('button', { name: 'Footwear' }));
    expect(useCommerceStore.getState().categoryId).toBe('fashion-men-footwear');
    // The breadcrumb jumps back up the path.
    await user.click(screen.getByRole('button', { name: 'Fashion' }));
    expect(useCommerceStore.getState().categoryId).toBe('fashion');
  });

  it('clears attribute filters when the category changes', () => {
    useCommerceStore.getState().setCategoryId('fashion');
    useCommerceStore.getState().setAttributeFilter('size', 'L');
    expect(useCommerceStore.getState().attributeFilters).toEqual({ size: 'L' });

    useCommerceStore.getState().setCategoryId('electronics');
    expect(useCommerceStore.getState().attributeFilters).toEqual({});
  });

  it('renders attribute facets from the facet pool and toggles a filter', async () => {
    const user = userEvent.setup();
    useCommerceStore.getState().setCategoryId('fashion');
    const facetItem = {
      id: 'seller:varsity_fleece',
      sellerId: 'seller',
      listingId: 'varsity_fleece',
      state: 'active' as const,
      title: 'Heavyweight varsity fleece',
      description: 'Boxy 90s collegiate fleece.',
      categoryId: 'fashion-men-tops-hoodies',
      condition: 'good' as const,
      tags: [],
      saleFormat: 'fixed_price' as const,
      price: { amountMinor: 7_200, currency: 'USD', exponent: 2 },
      auction: null,
      attributes: { size: 'L', brand: 'Champion', color: ['grey', 'navy'] },
      location: { countryCode: 'US', region: null },
      mediaUrls: [],
      reputation: null,
      revision: 1,
      updatedAt: 1_000,
    };
    render(<MarketplaceFilters resultCount={1} facetPool={[facetItem]} />);

    expect(screen.getByText('Size')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'L · 1' }));
    expect(useCommerceStore.getState().attributeFilters).toEqual({ size: 'L' });
    // Toggling the active chip clears it again.
    await user.click(screen.getByRole('button', { name: 'L · 1' }));
    expect(useCommerceStore.getState().attributeFilters).toEqual({});
  });
});

describe('MarketplaceFilters - Snapshots', () => {
  it('matches the default filter snapshot', () => {
    const { container } = render(<MarketplaceFilters resultCount={8} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
