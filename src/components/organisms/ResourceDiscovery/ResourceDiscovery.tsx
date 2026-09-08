'use client';

import { useEffect, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { ResourceController } from '@/controllers/resource/resource';
import { isAppError, isNotFound } from '@/libs/error/error.utils';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';
import { ResourceEmpty } from '@/molecules/ResourceEmpty/ResourceEmpty';
import type { NexusResource } from '@/services/nexus/resource/resource.types';
import { ResourceDiscoverySkeleton } from './ResourceDiscovery.skeleton';

export function ResourceDiscovery({ tag, id }: { tag?: string; id?: string }) {
  const [resources, setResources] = useState<NexusResource[]>([]);
  const [resource, setResource] = useState<NexusResource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFoundError, setIsNotFoundError] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setIsNotFoundError(false);
    setHasError(false);
    setResources([]);
    setResource(null);

    const request = tag
      ? ResourceController.fetchByTag({ tag, limit: 20 })
      : id?.includes('://')
        ? ResourceController.fetchByUri({ uri: id })
        : ResourceController.fetchById({ id: id ?? '' });

    request
      .then((result) => {
        if (!active) return;
        if (Array.isArray(result)) setResources(result);
        else {
          setResource({
            details: result.resource,
            tags: result.tags,
            taggers_count: result.tags.reduce((count, item) => count + item.taggers_count, 0),
          });
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
  }, [id, tag]);

  if (isLoading) return <ResourceDiscoverySkeleton />;
  if (!tag) {
    return resource ? (
      <ResourceCard resource={resource} />
    ) : (
      <ResourceEmpty unknown={isNotFoundError} error={hasError} />
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
            <ResourceCard key={item.details.id} resource={item} />
          ))}
        </Container>
      )}
    </Container>
  );
}

function isNotFoundErrorValue(error: unknown): boolean {
  return isAppError(error) && isNotFound(error);
}
