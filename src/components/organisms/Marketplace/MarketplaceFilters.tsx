'use client';

import { ChevronRight, Grid2X2, List, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Input } from '@/atoms/Input/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Typography } from '@/atoms/Typography/Typography';
import {
  commerceAttributeLabel,
  commerceAttributeSetKeys,
  commerceAttributeValueLabel,
  commerceCategoryChildren,
  resolveCommerceCategory,
} from '@/config/taxonomy/taxonomy';
import type { MarketplaceCatalogItem } from '@/hooks/useMarketplaceCatalog/useMarketplaceCatalog.utils';
import { collectMarketplaceAttributeFacets } from '@/hooks/useMarketplaceCatalog/useMarketplaceCatalog.utils';
import { cn } from '@/libs/utils/utils';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import type { CommerceSaleFormatFilter, CommerceSort } from '@/stores/commerce/commerce.types';

/** Facetable attribute keys, shown when the current category defines them. */
const FACET_KEYS = ['size', 'brand', 'color'] as const;
/** Most facet value chips rendered per attribute key. */
const MAX_FACET_VALUES = 10;

export interface MarketplaceFiltersProps {
  resultCount: number;
  /**
   * Items matching every filter except the attribute facets — the pool the
   * facet chips are computed from (see `useMarketplaceCatalog`).
   */
  facetPool?: MarketplaceCatalogItem[];
}

export function MarketplaceFilters({ resultCount, facetPool = [] }: MarketplaceFiltersProps) {
  const query = useCommerceStore((state) => state.query);
  const categoryId = useCommerceStore((state) => state.categoryId);
  const attributeFilters = useCommerceStore((state) => state.attributeFilters);
  const saleFormat = useCommerceStore((state) => state.saleFormat);
  const sort = useCommerceStore((state) => state.sort);
  const layout = useCommerceStore((state) => state.layout);
  const setQuery = useCommerceStore((state) => state.setQuery);
  const setCategoryId = useCommerceStore((state) => state.setCategoryId);
  const setAttributeFilter = useCommerceStore((state) => state.setAttributeFilter);
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

          <div
            role="group"
            className="hidden items-center rounded-full border bg-card p-1 sm:flex"
            aria-label="Listing layout"
          >
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

      <MarketplaceCategoryNavigation
        categoryId={categoryId}
        onSelect={setCategoryId}
        showClear={!!(query || categoryId || saleFormat !== 'all' || Object.keys(attributeFilters).length > 0)}
        onClear={resetFilters}
      />

      <MarketplaceAttributeFacets
        categoryId={categoryId}
        facetPool={facetPool}
        attributeFilters={attributeFilters}
        onToggle={setAttributeFilter}
      />

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

/**
 * Category tree navigation as drill-down chips: a breadcrumb of the current
 * path (each step clickable to jump back up) followed by the current node's
 * children. Filtering by a category includes everything beneath it — the
 * catalog filter matches by id prefix.
 */
function MarketplaceCategoryNavigation({
  categoryId,
  onSelect,
  showClear,
  onClear,
}: {
  categoryId: string | null;
  onSelect: (categoryId: string | null) => void;
  showClear: boolean;
  onClear: () => void;
}) {
  const resolved = categoryId ? resolveCommerceCategory(categoryId) : null;
  const path = resolved?.path ?? [];
  const children = resolved && resolved.node.legacy ? [] : commerceCategoryChildren(categoryId);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1" data-cy="marketplace-category-navigation">
      <Button
        size="sm"
        variant={categoryId === null ? 'default' : 'secondary'}
        className="shrink-0 rounded-full"
        aria-pressed={categoryId === null}
        onClick={() => onSelect(null)}
      >
        All
      </Button>
      {path.map((node, index) => (
        <span key={node.id} className="flex shrink-0 items-center gap-2">
          {index > 0 && <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground" />}
          <Button
            size="sm"
            variant={index === path.length - 1 ? 'default' : 'secondary'}
            className="shrink-0 rounded-full"
            aria-pressed={index === path.length - 1}
            onClick={() => onSelect(node.id)}
          >
            {node.label}
          </Button>
        </span>
      ))}
      {path.length > 0 && children.length > 0 && (
        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      {children.map((child) => (
        <Button
          key={child.id}
          size="sm"
          variant="secondary"
          className="shrink-0 rounded-full"
          onClick={() => onSelect(child.id)}
        >
          {child.label}
        </Button>
      ))}
      {showClear && (
        <Button size="sm" variant="ghost" className="shrink-0 rounded-full" onClick={onClear}>
          Clear
        </Button>
      )}
    </div>
  );
}

/**
 * Attribute facet chips for the current category (size/brand/color where the
 * category defines them), computed client-side over the cached catalog. The
 * scope note is honest: index projections do not carry attributes, so facets
 * cover items whose full record this device has cached.
 */
function MarketplaceAttributeFacets({
  categoryId,
  facetPool,
  attributeFilters,
  onToggle,
}: {
  categoryId: string | null;
  facetPool: MarketplaceCatalogItem[];
  attributeFilters: Record<string, string>;
  onToggle: (key: string, value: string | null) => void;
}) {
  if (!categoryId) return null;
  const categoryFacetKeys = commerceAttributeSetKeys(categoryId).filter((key) =>
    (FACET_KEYS as readonly string[]).includes(key),
  );
  if (categoryFacetKeys.length === 0) return null;

  const facets = collectMarketplaceAttributeFacets(facetPool, categoryFacetKeys);
  const rows = categoryFacetKeys
    .map((key) => ({ key, values: (facets.get(key) ?? []).slice(0, MAX_FACET_VALUES) }))
    .filter(({ key, values }) => values.length > 0 || attributeFilters[key] !== undefined);
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" data-cy="marketplace-attribute-facets">
      {rows.map(({ key, values }) => (
        <div key={key} className="flex items-center gap-2 overflow-x-auto pb-1">
          <Typography as="span" className="shrink-0 text-xs font-medium text-muted-foreground uppercase">
            {commerceAttributeLabel(key)}
          </Typography>
          {values.map(({ value, count }) => {
            const isActive = attributeFilters[key] === value;
            return (
              <Button
                key={value}
                size="sm"
                variant={isActive ? 'default' : 'secondary'}
                className="shrink-0 rounded-full"
                aria-pressed={isActive}
                onClick={() => onToggle(key, isActive ? null : value)}
              >
                {commerceAttributeValueLabel(key, value)} · {count}
              </Button>
            );
          })}
          {attributeFilters[key] !== undefined && !values.some(({ value }) => value === attributeFilters[key]) && (
            <Button
              size="sm"
              variant="default"
              className="shrink-0 rounded-full"
              aria-pressed
              onClick={() => onToggle(key, null)}
            >
              {commerceAttributeValueLabel(key, attributeFilters[key])}
            </Button>
          )}
        </div>
      ))}
      <Typography as="p" className="text-xs text-muted-foreground">
        Item-specific filters cover listings whose full details are cached on this device.
      </Typography>
    </div>
  );
}
