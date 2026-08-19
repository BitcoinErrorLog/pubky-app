'use client';

import { Grid2X2, List, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Input } from '@/atoms/Input/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Typography } from '@/atoms/Typography/Typography';
import { COMMERCE_CATEGORIES } from '@/config/commerce';
import { cn } from '@/libs/utils/utils';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import type { CommerceSaleFormatFilter, CommerceSort } from '@/stores/commerce/commerce.types';

export interface MarketplaceFiltersProps {
  resultCount: number;
}

export function MarketplaceFilters({ resultCount }: MarketplaceFiltersProps) {
  const query = useCommerceStore((state) => state.query);
  const categoryId = useCommerceStore((state) => state.categoryId);
  const saleFormat = useCommerceStore((state) => state.saleFormat);
  const sort = useCommerceStore((state) => state.sort);
  const layout = useCommerceStore((state) => state.layout);
  const setQuery = useCommerceStore((state) => state.setQuery);
  const setCategoryId = useCommerceStore((state) => state.setCategoryId);
  const setSaleFormat = useCommerceStore((state) => state.setSaleFormat);
  const setSort = useCommerceStore((state) => state.setSort);
  const setLayout = useCommerceStore((state) => state.setLayout);
  const resetFilters = useCommerceStore((state) => state.resetFilters);

  return (
    <section aria-label="Marketplace filters" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search marketplace</span>
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search items, styles, or sellers"
            className="h-11 rounded-full bg-card pr-4 pl-10"
          />
        </label>

        <div className="flex items-center gap-2">
          <Select value={saleFormat} onValueChange={(value) => setSaleFormat(value as CommerceSaleFormatFilter)}>
            <SelectTrigger aria-label="Sale format" className="h-11 min-w-32 rounded-full border px-4">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All formats</SelectItem>
              <SelectItem value="fixed_price">Buy now</SelectItem>
              <SelectItem value="auction">Auctions</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(value) => setSort(value as CommerceSort)}>
            <SelectTrigger aria-label="Sort marketplace" className="h-11 min-w-32 rounded-full border px-4">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recommended">Recommended</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price_low">Price: low</SelectItem>
              <SelectItem value="price_high">Price: high</SelectItem>
              <SelectItem value="ending_soon">Ending soon</SelectItem>
            </SelectContent>
          </Select>

          <div className="hidden items-center rounded-full border bg-card p-1 sm:flex" aria-label="Listing layout">
            <Button
              variant={layout === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="size-8 rounded-full"
              aria-label="Grid view"
              aria-pressed={layout === 'grid'}
              onClick={() => setLayout('grid')}
            >
              <Grid2X2 className="size-4" />
            </Button>
            <Button
              variant={layout === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="size-8 rounded-full"
              aria-label="List view"
              aria-pressed={layout === 'list'}
              onClick={() => setLayout('list')}
            >
              <List className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Button
          size="sm"
          variant={categoryId === null ? 'default' : 'secondary'}
          className="shrink-0 rounded-full"
          onClick={() => setCategoryId(null)}
        >
          All
        </Button>
        {COMMERCE_CATEGORIES.map((category) => (
          <Button
            key={category.id}
            size="sm"
            variant={categoryId === category.id ? 'default' : 'secondary'}
            className="shrink-0 rounded-full"
            onClick={() => setCategoryId(category.id)}
          >
            {category.label}
          </Button>
        ))}
        {(query || categoryId || saleFormat !== 'all') && (
          <Button size="sm" variant="ghost" className="shrink-0 rounded-full" onClick={resetFilters}>
            Clear
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <Typography as="p" className="text-sm text-muted-foreground" aria-live="polite">
          {resultCount.toLocaleString('en-US')} {resultCount === 1 ? 'item' : 'items'}
        </Typography>
        <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', resultCount === 0 && 'text-brand')}>
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          Curated local marketplace
        </div>
      </div>
    </section>
  );
}
