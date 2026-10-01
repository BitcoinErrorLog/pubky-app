/**
 * Social link-out: the Shop hands its social surfaces (feed, profiles, posts,
 * collections, settings) to the canonical social app on another origin.
 *
 * The switch is one build-time variable, `NEXT_PUBLIC_SOCIAL_HOST`, holding the
 * social app's exact origin (`https://pubky.app` in production,
 * `https://staging.pubky.app` on staging). Unset means link-out is off and the
 * Shop keeps serving its own copy of those routes.
 *
 * This module has no `@/` imports so `next.config.ts` can load it to build
 * `redirects()`; components read the same list through `@/config/social`.
 */

export const SOCIAL_HOST_ENV_VAR = 'NEXT_PUBLIC_SOCIAL_HOST';

/**
 * Shop paths that leave for the social host, unchanged (path and query), in
 * Next.js `redirects()` source syntax. The Shop's social routes are the same
 * tree as pubky.app's, so every match maps 1:1 onto the same path there.
 * `:path*` also matches the bare prefix (`/profile`, `/settings`, ...).
 */
export const SOCIAL_LINK_OUT_SOURCES = [
  '/home',
  '/feed/:path*',
  '/hot',
  '/search',
  '/who-to-follow',
  '/post/:path*',
  '/collections/:path*',
  '/profile/:path*',
  '/settings/:path*',
] as const;

/**
 * Social paths whose Shop counterpart stays in the Shop. They are listed
 * before {@link SOCIAL_LINK_OUT_SOURCES} because the first matching redirect wins.
 */
export const SOCIAL_KEPT_IN_SHOP: readonly { source: string; destination: string }[] = [
  { source: '/profile/notifications', destination: '/marketplace/notifications' },
];

export type SocialLinkOutRedirect = {
  source: string;
  destination: string;
  permanent: false;
};

/**
 * Exact `https://` origin, or `http://localhost:<port>` when `nodeEnv !== 'production'`.
 * Paths, trailing slashes, bare hosts and non-loopback `http://` fail.
 */
export function isValidSocialHost(value: string, nodeEnv: string | undefined): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.origin !== value) return false;
  if (url.protocol === 'https:') return true;
  return nodeEnv !== 'production' && url.protocol === 'http:' && url.hostname === 'localhost';
}

/** Unset or empty → `undefined` (link-out off). An invalid value throws so a bad build fails loudly. */
export function parseSocialHost(value: string | undefined, nodeEnv: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!isValidSocialHost(value, nodeEnv)) {
    throw new Error(
      `${SOCIAL_HOST_ENV_VAR} must be an exact https:// origin (e.g. https://pubky.app), ` +
        `or http://localhost:<port> outside production builds. Received: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/** Temporary (307) redirects so switching link-out off never leaves browsers holding cached permanents. */
export function buildSocialLinkOutRedirects(socialHost: string | undefined): SocialLinkOutRedirect[] {
  if (!socialHost) return [];
  return [
    ...SOCIAL_KEPT_IN_SHOP.map(({ source, destination }) => ({ source, destination, permanent: false as const })),
    ...SOCIAL_LINK_OUT_SOURCES.map((source) => ({
      source,
      destination: `${socialHost}${source}`,
      permanent: false as const,
    })),
  ];
}

/** Absolute URL of `path` (which must start with `/`) on the social host. */
export function toSocialHostUrl(socialHost: string, path: string): string {
  return `${socialHost}${path}`;
}
