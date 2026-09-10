import { describe, expect, it } from 'vitest';
import { normalizeResourceUri } from './normalizeResourceUri';

describe('normalizeResourceUri', () => {
  it.each([
    ['HTTPS://Example.COM:443/A/B?Q=1#frag', 'https://example.com/A/B?Q=1'],
    ['http://example.com:80/', 'http://example.com/'],
    ['http://example.com:8080/x', 'http://example.com:8080/x'],
    ['https://example.com', 'https://example.com/'],
    ["https://example.com/p?a=%20b&c='d'", "https://example.com/p?a=%20b&c='d'"],
    ['mailto:Someone@Example.com', 'mailto:Someone@Example.com'],
    [
      'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/readme',
      'ipfs://qmywapjzv5czsna625s3xf2nemtygpphdwez79ojwnpbdg/readme',
    ],
    ['pubky://O1GG96ABCDEF/path#fragment', 'pubky://o1gg96abcdef/path'],
    ['HTTPS://user:password@Example.COM:443/x#top', 'https://example.com/x'],
  ])('normalizes %s like Nexus', (input, expected) => {
    expect(normalizeResourceUri(input)).toBe(expected);
  });

  it('rejects an invalid URI', () => {
    expect(() => normalizeResourceUri('no-scheme')).toThrow();
    expect(() => normalizeResourceUri('/relative/path')).toThrow();
  });
});
