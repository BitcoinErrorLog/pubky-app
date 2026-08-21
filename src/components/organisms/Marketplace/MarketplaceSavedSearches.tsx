'use client';

import { useState } from 'react';
import { BookmarkPlus, Search, X } from 'lucide-react';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Input } from '@/atoms/Input/Input';
import { Typography } from '@/atoms/Typography/Typography';
import { COMMERCE_SAVED_SEARCH_NAME_MAX_CHARS } from '@/config/commerce';
import { useMarketplaceSavedSearches } from '@/hooks/useMarketplaceSavedSearches/useMarketplaceSavedSearches';
import type { CommerceSavedSearchModelSchema } from '@/models/commerce/commerce.schema';

/**
 * The saved-searches row on the marketplace page: apply-on-click chips with
 * an honest NEW badge (matches counted past the acknowledged watermark from
 * a real catalog check — see `useMarketplaceSavedSearches`), a delete
 * affordance per chip, and an inline save flow for the current filter
 * combination. Renders nothing when signed out: saved searches are
 * account-scoped local data.
 */
export function MarketplaceSavedSearches() {
  const { searches, isSignedIn, saveCurrentSearch, applySearch, deleteSearch } = useMarketplaceSavedSearches();
  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isSignedIn) return null;

  const submitSave = async () => {
    if (name.trim().length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const saved = await saveCurrentSearch(name);
      if (saved) {
        setName('');
        setIsNaming(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const apply = async (search: CommerceSavedSearchModelSchema) => {
    await applySearch(search);
    document.getElementById('marketplace-catalog')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      aria-label="Saved searches"
      data-cy="marketplace-saved-searches"
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <Typography as="h2" className="text-sm font-semibold">
            Saved searches
          </Typography>
          <Typography as="span" className="text-xs text-muted-foreground">
            Checked when you visit — NEW counts newer matches since you last opened each search.
          </Typography>
        </div>
        {isNaming ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submitSave();
            }}
          >
            <Input
              autoFocus
              value={name}
              maxLength={COMMERCE_SAVED_SEARCH_NAME_MAX_CHARS}
              placeholder="Name this search"
              aria-label="Saved search name"
              className="h-8 w-48"
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" size="sm" className="rounded-full" disabled={name.trim().length === 0 || isSaving}>
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full"
              onClick={() => {
                setIsNaming(false);
                setName('');
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setIsNaming(true)}>
            <BookmarkPlus className="mr-1.5 size-4" />
            Save current search
          </Button>
        )}
      </div>

      {searches.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {searches.map((search) => (
            <li key={search.id} className="flex items-center gap-1 rounded-full border bg-background/60 py-1 pr-1 pl-3">
              <button
                type="button"
                className="flex items-center gap-2 text-sm hover:text-brand focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                data-cy="marketplace-saved-search-apply"
                onClick={() => void apply(search)}
              >
                {search.name}
                {search.new_count > 0 && (
                  <Badge className="bg-brand px-1.5 py-0 text-[10px] text-primary-foreground">
                    {search.new_count} NEW
                  </Badge>
                )}
              </button>
              <button
                type="button"
                aria-label={`Delete saved search ${search.name}`}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => void deleteSearch(search.id)}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Typography as="p" className="text-sm text-muted-foreground">
          No saved searches yet. Set filters or a search term, then save the combination to get a NEW badge when later
          matches appear.
        </Typography>
      )}
    </section>
  );
}
