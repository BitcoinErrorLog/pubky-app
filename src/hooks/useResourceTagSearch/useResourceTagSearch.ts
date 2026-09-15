'use client';

import { useEffect, useState } from 'react';
import { ResourceController } from '@/controllers/resource/resource';
import type { Resource } from '@/models/resource/resource';

export function useResourceTagSearch(tags: string[]) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(tags.length > 0);
  const [error, setError] = useState<unknown>(null);
  const tagsKey = tags.join('\0');

  useEffect(() => {
    let active = true;
    const labels = tagsKey
      .split('\0')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (labels.length === 0) {
      setResources([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    void Promise.all(
      labels.map((singleTag) =>
        ResourceController.fetchByTag({
          tag: singleTag,
          limit: 20,
          limit_tags: 50,
          limit_taggers: 50,
          sorting: 'taggers_count',
        }),
      ),
    )
      .then((results) => {
        const resourcesById = new Map<string, Resource>();
        results.flat().forEach((resource) => {
          const existing = resourcesById.get(resource.details.id);
          if (!existing || (resource.taggers_count ?? 0) > (existing.taggers_count ?? 0)) {
            resourcesById.set(resource.details.id, resource);
          }
        });
        const merged = [...resourcesById.values()].sort(
          (left, right) =>
            (right.taggers_count ?? 0) - (left.taggers_count ?? 0) ||
            right.details.indexed_at - left.details.indexed_at,
        );
        if (active) setResources(merged);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tagsKey]);

  return { resources, isLoading, error };
}
