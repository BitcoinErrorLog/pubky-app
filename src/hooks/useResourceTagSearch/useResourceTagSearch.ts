'use client';

import { useEffect, useState } from 'react';
import { ResourceController } from '@/controllers/resource/resource';
import type { NexusResource } from '@/services/nexus/resource/resource.types';

export function useResourceTagSearch(tag: string | null) {
  const [resources, setResources] = useState<NexusResource[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(tag));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    if (!tag) {
      setResources([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    void ResourceController.fetchByTag({
      tag,
      limit: 20,
      limit_tags: 50,
      limit_taggers: 50,
      sorting: 'taggers_count',
    })
      .then((result) => {
        if (active) setResources(result);
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
  }, [tag]);

  return { resources, isLoading, error };
}
