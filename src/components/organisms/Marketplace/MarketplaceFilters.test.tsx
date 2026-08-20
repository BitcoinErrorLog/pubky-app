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

  it('clears active discovery filters without changing layout', async () => {
    const user = userEvent.setup();
    useCommerceStore.getState().setLayout('list');
    useCommerceStore.getState().setQuery('camera');
    render(<MarketplaceFilters resultCount={1} />);

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(useCommerceStore.getState()).toMatchObject({
      query: '',
      categoryId: null,
      saleFormat: 'all',
      layout: 'list',
    });
  });
});

describe('MarketplaceFilters - Snapshots', () => {
  it('matches the default filter snapshot', () => {
    const { container } = render(<MarketplaceFilters resultCount={8} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
