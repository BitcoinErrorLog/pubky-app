'use client';

import { useEffect, useState } from 'react';
import { ResourceController } from '@/controllers/resource/resource';
import type { NexusResource } from '@/services/nexus/resource/resource.types';

export function useInlineResource(content: string) {
  const [resource, setResource] = useState<NexusResource | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const url = findHttpUrl(content);
    let active = true;
    if (!url) {
      setResource(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void ResourceController.getOrFetchByUri(url)
      .then((response) => {
        if (!active) return;
        setResource(response && response.tags.length > 0 ? { details: response.resource, tags: response.tags } : null);
      })
      .catch(() => {
        if (active) setResource(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [content]);

  return { resource, isLoading };
}

function findHttpUrl(content: string): string | null {
  return content.match(/https?:\/\/[^\s<>()]+/i)?.[0] ?? null;
}
