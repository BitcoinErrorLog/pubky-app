import { describe, expect, it } from 'vitest';
import { normalizeResourceUri } from './normalizeResourceUri';

describe('normalizeResourceUri', () => {
  it('normalizes scheme, host, default port, fragment, and userinfo', () => {
    expect(normalizeResourceUri('HTTPS://user:password@Example.COM:443/x#top')).toBe('https://example.com/x');
  });

  it('preserves path case and query values', () => {
    expect(normalizeResourceUri('https://Example.COM/Path?Query=Value')).toBe('https://example.com/Path?Query=Value');
  });

  it('rejects a relative URI', () => {
    expect(() => normalizeResourceUri('/relative/path')).toThrow();
  });
});
