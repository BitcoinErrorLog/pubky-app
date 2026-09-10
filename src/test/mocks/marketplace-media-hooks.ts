function resolve(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  const path = uri.slice(uri.indexOf('/pub/'));
  const owner = uri.slice('pubky://'.length, uri.indexOf('/pub/'));
  return `https://homeserver.example${path}?pubky-host=${owner}`;
}

export function useMarketplaceMediaUrl(uri: string | null | undefined): string | null {
  return resolve(uri);
}

export async function resolveMarketplaceMediaUrlAsync(uri: string): Promise<string | null> {
  return resolve(uri);
}

export function useMarketplaceFirstMediaUrl(uris: readonly string[]): string | null {
  return uris.map(resolve).find((url): url is string => url !== null) ?? null;
}

export function useMarketplaceMediaUrls(uris: readonly string[]): readonly (string | null)[] {
  return uris.map(resolve);
}

export function useMarketplaceFirstMediaUrls(uris: readonly (readonly string[])[]): readonly (string | null)[] {
  return uris.map((group) => group.map(resolve).find((url): url is string => url !== null) ?? null);
}
