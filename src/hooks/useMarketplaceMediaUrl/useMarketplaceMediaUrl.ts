'use client';

import { useEffect, useState } from 'react';
import { MarketplaceMediaService } from '@/core/services/commerce/marketplace-media';
import { getMarketplaceMediaOwner, resolveMarketplaceMediaUrl } from '@/libs/commerce/media-url';

const OWNER_CACHE_TTL_MS = 5 * 60 * 1000;
const MEDIA_CACHE_LIMIT = 100;

type CacheEntry = { value: string | null; expiresAt: number };

const ownerCache = new Map<string, CacheEntry>();
const ownerRequests = new Map<string, Promise<string | null>>();
const mediaCache = new Map<string, CacheEntry>();
const mediaRequests = new Map<string, Promise<string | null>>();

function getCached(
  cache: Map<string, CacheEntry>,
  key: string,
  onExpire?: (value: string | null) => void,
): string | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    onExpire?.(entry.value);
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheMedia(uri: string, value: string | null): void {
  mediaCache.set(uri, { value, expiresAt: Date.now() + OWNER_CACHE_TTL_MS });
  while (mediaCache.size > MEDIA_CACHE_LIMIT) {
    const oldestUri = mediaCache.keys().next().value;
    if (!oldestUri) return;
    const oldest = mediaCache.get(oldestUri)?.value;
    if (oldest?.startsWith('blob:')) URL.revokeObjectURL(oldest);
    mediaCache.delete(oldestUri);
  }
}

async function getOwnerHomeserver(owner: string): Promise<string | null> {
  const cached = getCached(ownerCache, owner);
  if (cached !== undefined) return cached;

  const existing = ownerRequests.get(owner);
  if (existing) return await existing;

  const request = MarketplaceMediaService.getOwnerHomeserver(owner)
    .then((homeserver) => {
      ownerCache.set(owner, { value: homeserver, expiresAt: Date.now() + OWNER_CACHE_TTL_MS });
      return homeserver;
    })
    .finally(() => ownerRequests.delete(owner));
  ownerRequests.set(owner, request);
  return await request;
}

export async function resolveMarketplaceMediaUrlAsync(uri: string): Promise<string | null> {
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  const owner = getMarketplaceMediaOwner(uri);
  if (!owner) return null;
  if (!resolveMarketplaceMediaUrl(uri, MarketplaceMediaService.getConfiguredHomeserverUrl())) return null;

  const cached = getCached(mediaCache, uri, (value) => {
    if (value?.startsWith('blob:')) URL.revokeObjectURL(value);
  });
  if (cached !== undefined) return cached;
  const existing = mediaRequests.get(uri);
  if (existing) return await existing;

  const request = getOwnerHomeserver(owner)
    .then(async (ownerHomeserver) => {
      if (!ownerHomeserver) {
        cacheMedia(uri, null);
        return null;
      }

      if (ownerHomeserver === MarketplaceMediaService.getConfiguredHomeserver()) {
        const url = resolveMarketplaceMediaUrl(uri, MarketplaceMediaService.getConfiguredHomeserverUrl());
        cacheMedia(uri, url);
        return url;
      }

      const blob = await MarketplaceMediaService.fetchMedia(uri);
      const objectUrl = URL.createObjectURL(blob);
      cacheMedia(uri, objectUrl);
      return objectUrl;
    })
    .finally(() => mediaRequests.delete(uri));
  mediaRequests.set(uri, request);
  return await request;
}

export function useMarketplaceMediaUrl(uri: string | null | undefined): string | null {
  const [url, setUrl] = useState(() => (uri ? getSynchronousMediaUrl(uri) : null));

  useEffect(() => {
    if (!uri) {
      setUrl(null);
      return;
    }

    let active = true;
    void resolveMarketplaceMediaUrlAsync(uri)
      .then((resolvedUrl) => {
        if (active) setUrl(resolvedUrl);
      })
      .catch(() => {
        if (active) setUrl(null);
      });

    return () => {
      active = false;
    };
  }, [uri]);

  return url;
}

export function useMarketplaceFirstMediaUrl(uris: readonly string[]): string | null {
  const [url, setUrl] = useState(
    () => uris.map(getSynchronousMediaUrl).find((url): url is string => url !== null) ?? null,
  );

  useEffect(() => {
    let active = true;
    if (uris.length === 0) {
      setUrl(null);
      return;
    }

    void Promise.all(uris.map((uri) => resolveMarketplaceMediaUrlAsync(uri)))
      .then((resolvedUrls) => {
        if (active) setUrl(resolvedUrls.find((resolvedUrl) => resolvedUrl !== null) ?? null);
      })
      .catch(() => {
        if (active) setUrl(null);
      });

    return () => {
      active = false;
    };
  }, [uris.join('\u0000')]);

  return url;
}

export function useMarketplaceMediaUrls(uris: readonly string[]): readonly (string | null)[] {
  const [urls, setUrls] = useState<readonly (string | null)[]>(() => uris.map(getSynchronousMediaUrl));

  useEffect(() => {
    let active = true;
    void Promise.all(uris.map((uri) => resolveMarketplaceMediaUrlAsync(uri)))
      .then((resolvedUrls) => {
        if (active) setUrls(resolvedUrls);
      })
      .catch(() => {
        if (active) setUrls(uris.map(() => null));
      });

    return () => {
      active = false;
    };
  }, [uris.join('\u0000')]);

  return urls;
}

export function useMarketplaceFirstMediaUrls(uris: readonly (readonly string[])[]): readonly (string | null)[] {
  const flattened = uris.flat();
  const resolved = useMarketplaceMediaUrls(flattened);
  const result: (string | null)[] = [];
  let offset = 0;
  for (const group of uris) {
    const first = group.map((_, index) => resolved[offset + index]).find((url): url is string => url !== null);
    result.push(first ?? null);
    offset += group.length;
  }
  return result;
}

function isDirectUrl(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

function getSynchronousMediaUrl(uri: string): string | null {
  if (isDirectUrl(uri)) return uri;
  const owner = getMarketplaceMediaOwner(uri);
  if (!owner) return null;
  const ownerHomeserver = getCached(ownerCache, owner);
  if (ownerHomeserver !== MarketplaceMediaService.getConfiguredHomeserver()) return null;
  return resolveMarketplaceMediaUrl(uri, MarketplaceMediaService.getConfiguredHomeserverUrl());
}

export function clearMarketplaceMediaCache(): void {
  for (const entry of mediaCache.values()) {
    if (entry.value?.startsWith('blob:')) URL.revokeObjectURL(entry.value);
  }
  ownerCache.clear();
  ownerRequests.clear();
  mediaRequests.clear();
  mediaCache.clear();
}
