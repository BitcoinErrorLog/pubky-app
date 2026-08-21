import { getHomeserverUrl } from '@/libs/runtime-config/runtime-config';

const PUBKY_PROTOCOL = 'pubky://';
const PUBKY_Z32_LENGTH = 52;
const PUBKY_Z32_PATTERN = /^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/;
const PUB_PATH_PREFIX = '/pub/';

/**
 * Resolves a marketplace media URI to a URL the browser can load directly.
 *
 * Marketplace media files are raw bytes the seller uploaded to their own
 * homeserver under `/pub/pubky.app/marketplace/v1/media/<id>` (see
 * `useListingMediaPicker` for the upload side). `/pub/*` paths are publicly
 * readable over the homeserver's plain HTTPS endpoint without authentication;
 * the homeserver identifies the tenant from the `pubky-host` QUERY PARAMETER
 * (its `PubkyHostLayer` checks the `host` header, the `pubky-host` header,
 * then the `pubky-host` query param — only the query param is expressible in
 * an `<img src>`). Verified against the live staging homeserver:
 * `GET https://homeserver.staging.pubky.app/pub/...?pubky-host=<z32>` → 200.
 *
 * Honest limitation: this resolves against the DEPLOYMENT'S configured
 * homeserver (`PUBKY_RUNTIME_HOMESERVER_URL`). A seller hosted on a different
 * homeserver would need pkarr resolution, which a plain image element cannot
 * do — such media 404s and the UI falls back to its media-less rendering.
 *
 * @param uri - A `pubky://<z32>/pub/...` media URI (record `media[].url` or an
 *   index `media_urls` entry). Plain http(s) URLs pass through unchanged.
 * @returns A fetchable URL, or null when the URI has no browser-loadable form.
 */
export function resolveMarketplaceMediaUrl(uri: string): string | null {
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  if (!uri.startsWith(PUBKY_PROTOCOL)) return null;

  const rest = uri.slice(PUBKY_PROTOCOL.length);
  const owner = rest.slice(0, PUBKY_Z32_LENGTH);
  const path = rest.slice(PUBKY_Z32_LENGTH);
  if (!PUBKY_Z32_PATTERN.test(owner) || !path.startsWith(PUB_PATH_PREFIX)) return null;

  const base = getHomeserverUrl().replace(/\/$/, '');
  return `${base}${path}?pubky-host=${owner}`;
}

/**
 * Resolves the first loadable URL from a listing's media URI list — what a
 * catalog card shows as its cover image. Null when nothing resolves, which is
 * the card's cue to keep its gradient fallback.
 */
export function resolveFirstMarketplaceMediaUrl(uris: readonly string[]): string | null {
  for (const uri of uris) {
    const url = resolveMarketplaceMediaUrl(uri);
    if (url) return url;
  }
  return null;
}
