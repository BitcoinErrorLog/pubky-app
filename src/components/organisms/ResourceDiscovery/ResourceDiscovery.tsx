'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import type { FormEvent } from 'react';
import { getResourceLookupRoute, getResourceRoute, getResourceTagRoute } from '@/app/routes';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { CONTENT_GUTTER_CLASS } from '@/config/layoutClasses';
import { RESOURCE_DISCOVERY_LIMIT } from '@/config/nexus';
import { ResourceController } from '@/controllers/resource/resource';
import { useResourceLookupForm } from '@/hooks/useResourceLookupForm/useResourceLookupForm';
import type { ResourceLookupFormData } from '@/hooks/useResourceLookupForm/useResourceLookupForm.types';
import { isAppError, isNotFound } from '@/libs/error/error.utils';
import { cn } from '@/libs/utils/utils';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';
import { ResourceEmpty } from '@/molecules/ResourceEmpty/ResourceEmpty';
import type { NexusResource, TResourceStreamParams } from '@/services/nexus/resource/resource.types';
import { ResourceDiscoverySkeleton } from './ResourceDiscovery.skeleton';

export function ResourceDiscovery({ tag, id }: { tag?: string; id?: string }) {
  const router = useRouter();
  const [resources, setResources] = useState<NexusResource[]>([]);
  const [resource, setResource] = useState<NexusResource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFoundError, setIsNotFoundError] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [sort, setSort] = useState<TResourceStreamParams['sorting']>('timeline');
  const [tagLabels, setTagLabels] = useState<string[]>([]);
  const [nextSkip, setNextSkip] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const lookup = useResourceLookupForm((value) => router.push(getResourceLookupRoute(value)));

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setIsNotFoundError(false);
    setHasError(false);
    setResources([]);
    setResource(null);
    setNextSkip(null);
    setLoadMoreError(false);

    const request = tag
      ? ResourceController.fetchByTag({ tag, limit: RESOURCE_DISCOVERY_LIMIT })
      : !id
        ? ResourceController.fetchStreamPage({ sorting: sort })
        : id?.includes('://')
          ? ResourceController.fetchByUri({ uri: id })
          : ResourceController.fetchById({ id: id ?? '' });

    request
      .then((result) => {
        if (!active) return;
        if (Array.isArray(result)) {
          setResources(result);
          setTagLabels(labelsByFrequency(result));
        } else if ('resources' in result) {
          setResources(result.resources);
          setNextSkip(result.nextSkip);
          setTagLabels(labelsByFrequency(result.resources));
        } else {
          setResource({
            details: result.resource,
            tags: result.tags,
          });
          if (id?.includes('://')) router.replace(getResourceRoute(result.resource.id));
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setIsNotFoundError(isNotFoundErrorValue(error));
          setHasError(!isNotFoundErrorValue(error));
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, router, sort, tag]);

  async function loadMore() {
    if (loadingMore || nextSkip === null) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const result = await ResourceController.fetchStreamPage({
        sorting: sort,
        skip: nextSkip,
      });
      setResources((current) => [...current, ...result.resources]);
      setNextSkip(result.nextSkip);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await lookup.submit();
  }

  if (isLoading) return <ResourceDiscoverySkeleton />;
  if (!tag && !id) {
    return (
      <Container
        overrideDefaults
        data-surface="resource-discovery"
        className={cn(
          'container m-auto w-full max-w-(--container-max-width) flex-col gap-6 pb-12',
          CONTENT_GUTTER_CLASS,
        )}
      >
        <Container overrideDefaults className="gap-3">
          <Heading level={1} size="xl">
            Resource discovery
          </Heading>
          <form className="flex gap-2" onSubmit={submitLookup}>
            <ControlledInputField<ResourceLookupFormData>
              name="uri"
              control={lookup.form.control}
              placeholder="Paste a URL"
              ariaLabel="Resource URL"
            />
            <Button type="submit" variant={ButtonVariant.BRAND} aria-label="Look up resource">
              <Search aria-hidden="true" />
              Look up
            </Button>
          </form>
          <Container overrideDefaults className="flex flex-wrap items-center gap-2">
            <Container overrideDefaults className="flex flex-1 flex-wrap items-center gap-2">
              {tagLabels.map((label) => (
                <Button
                  key={label}
                  type="button"
                  size="sm"
                  variant={ButtonVariant.OUTLINE}
                  onClick={() => router.push(getResourceTagRoute(label))}
                >
                  {label}
                </Button>
              ))}
            </Container>
            <Select value={sort} onValueChange={(value) => setSort(value as TResourceStreamParams['sorting'])}>
              <SelectTrigger size="sm" aria-label="Sort resources" className="ml-auto border border-border/60 px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="timeline">Recent</SelectItem>
                <SelectItem value="taggers_count">Most taggers</SelectItem>
              </SelectContent>
            </Select>
          </Container>
        </Container>
        {resources.length === 0 ? (
          <ResourceEmpty error={hasError} />
        ) : (
          <Container overrideDefaults className="gap-4">
            {resources.map((item) => (
              <ResourceCard key={item.details.id} resource={item} showDetailsLink />
            ))}
            {nextSkip !== null ? (
              <Button type="button" variant={ButtonVariant.OUTLINE} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : loadMoreError ? 'Retry loading resources' : 'Load more'}
              </Button>
            ) : null}
          </Container>
        )}
      </Container>
    );
  }
  if (!tag) {
    return resource ? (
      <ResourceCard resource={resource} />
    ) : (
      <ResourceEmpty unknown={isNotFoundError} error={hasError} lookup={id?.includes('://')} />
    );
  }

  return (
    <Container className="gap-6">
      <Heading level={1} size="xl">
        Resources tagged {tag}
      </Heading>
      {resources.length === 0 ? (
        <ResourceEmpty error={hasError} unknown={isNotFoundError} />
      ) : (
        <Container className="gap-4">
          {resources.map((item) => (
            <ResourceCard key={item.details.id} resource={item} showDetailsLink />
          ))}
        </Container>
      )}
    </Container>
  );
}

function isNotFoundErrorValue(error: unknown): boolean {
  return isAppError(error) && isNotFound(error);
}

function labelsByFrequency(items: NexusResource[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) counts.set(tag.label, (counts.get(tag.label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([, left], [, right]) => right - left)
    .slice(0, 12)
    .map(([label]) => label);
}
