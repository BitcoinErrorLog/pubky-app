'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import type { FormEvent } from 'react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Input } from '@/atoms/Input/Input';
import { ResourceController } from '@/controllers/resource/resource';
import { isAppError, isNotFound } from '@/libs/error/error.utils';
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
  const [uri, setUri] = useState('');
  const [sort, setSort] = useState<TResourceStreamParams['sorting']>('timeline');
  const [tagLabels, setTagLabels] = useState<string[]>([]);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setIsNotFoundError(false);
    setHasError(false);
    setResources([]);
    setResource(null);

    const request = tag
      ? ResourceController.fetchByTag({ tag, limit: 20 })
      : !id
        ? ResourceController.fetchStreamPage({ app: 'jeb.pubky.app', limit: 20, sorting: sort })
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
          setLastScore(result.lastScore);
          setTagLabels(labelsByFrequency(result.resources));
        } else {
          setResource({
            details: result.resource,
            tags: result.tags,
            taggers_count: result.tags.reduce((count, item) => count + item.taggers_count, 0),
          });
          if (id?.includes('://')) router.replace(`/resources/${encodeURIComponent(result.resource.id)}`);
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
    if (loadingMore || lastScore === null) return;
    setLoadingMore(true);
    try {
      const result = await ResourceController.fetchStreamPage({
        app: 'jeb.pubky.app',
        limit: 20,
        sorting: sort,
        end: lastScore,
      });
      setResources((current) => [...current, ...result.resources]);
      setLastScore(result.lastScore);
    } finally {
      setLoadingMore(false);
    }
  }

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = uri.trim();
    if (!value) return;
    router.push(`/resources/lookup?uri=${encodeURIComponent(value)}`);
  }

  if (isLoading) return <ResourceDiscoverySkeleton />;
  if (!tag && !id) {
    return (
      <Container data-surface="resource-discovery" className="gap-6">
        <Container overrideDefaults className="gap-3">
          <Heading level={1} size="xl">
            Resource discovery
          </Heading>
          <form className="flex gap-2" onSubmit={submitLookup}>
            <Input
              value={uri}
              onChange={(event) => setUri(event.target.value)}
              placeholder="Paste a URL"
              aria-label="Resource URL"
            />
            <Button type="submit" variant={ButtonVariant.BRAND} aria-label="Look up resource">
              <Search aria-hidden="true" />
              Look up
            </Button>
          </form>
          <Container overrideDefaults className="flex-row flex-wrap gap-2">
            {tagLabels.map((label) => (
              <Button
                key={label}
                type="button"
                size="sm"
                variant={ButtonVariant.OUTLINE}
                onClick={() => router.push(`/resources/tag/${encodeURIComponent(label)}`)}
              >
                {label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={ButtonVariant.SECONDARY}
              onClick={() => setSort(sort === 'timeline' ? 'taggers_count' : 'timeline')}
            >
              Sort: {sort === 'timeline' ? 'Recent' : 'Most taggers'}
            </Button>
          </Container>
        </Container>
        {resources.length === 0 ? (
          <ResourceEmpty />
        ) : (
          <Container overrideDefaults className="gap-4">
            {resources.map((item) => (
              <ResourceCard key={item.details.id} resource={item} showDetailsLink />
            ))}
            {lastScore !== null ? (
              <Button type="button" variant={ButtonVariant.OUTLINE} onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
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
