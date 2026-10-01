import { describe, expect, it } from 'vitest';
import {
  buildSocialLinkOutRedirects,
  isValidSocialHost,
  parseSocialHost,
  SOCIAL_LINK_OUT_SOURCES,
  toSocialHostUrl,
} from './social-host';

describe('isValidSocialHost', () => {
  it.each(['https://pubky.app', 'https://staging.pubky.app'])('accepts the exact origin %s', (value) => {
    expect(isValidSocialHost(value, 'production')).toBe(true);
  });

  it.each([
    'https://pubky.app/',
    'https://pubky.app/home',
    'pubky.app',
    'http://pubky.app',
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (value) => {
    expect(isValidSocialHost(value, 'production')).toBe(false);
  });

  it('accepts http://localhost only outside production', () => {
    expect(isValidSocialHost('http://localhost:3000', 'development')).toBe(true);
    expect(isValidSocialHost('http://localhost:3000', 'production')).toBe(false);
  });
});

describe('parseSocialHost', () => {
  it('returns undefined when unset or empty', () => {
    expect(parseSocialHost(undefined, 'production')).toBeUndefined();
    expect(parseSocialHost('', 'production')).toBeUndefined();
  });

  it('returns a valid origin unchanged', () => {
    expect(parseSocialHost('https://staging.pubky.app', 'production')).toBe('https://staging.pubky.app');
  });

  it('throws on an invalid value', () => {
    expect(() => parseSocialHost('https://pubky.app/', 'production')).toThrow(/NEXT_PUBLIC_SOCIAL_HOST/);
  });
});

describe('buildSocialLinkOutRedirects', () => {
  it('is empty when link-out is off', () => {
    expect(buildSocialLinkOutRedirects(undefined)).toEqual([]);
  });

  it('keeps profile notifications in the Shop ahead of the social profile redirect', () => {
    const redirects = buildSocialLinkOutRedirects('https://pubky.app');
    const notifications = redirects.findIndex((route) => route.source === '/profile/notifications');
    const profile = redirects.findIndex((route) => route.source === '/profile/:path*');

    expect(redirects[notifications]).toEqual({
      source: '/profile/notifications',
      destination: '/marketplace/notifications',
      permanent: false,
    });
    expect(notifications).toBeLessThan(profile);
  });

  it('sends every social source to the same path on the social host', () => {
    const redirects = buildSocialLinkOutRedirects('https://pubky.app');

    for (const source of SOCIAL_LINK_OUT_SOURCES) {
      expect(redirects).toContainEqual({ source, destination: `https://pubky.app${source}`, permanent: false });
    }
  });
});

describe('toSocialHostUrl', () => {
  it('joins the origin and path', () => {
    expect(toSocialHostUrl('https://pubky.app', '/profile/abc')).toBe('https://pubky.app/profile/abc');
  });
});
