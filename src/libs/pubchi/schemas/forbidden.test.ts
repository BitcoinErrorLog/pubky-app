import { describe, expect, it } from 'vitest';
import servicePatterns from './__fixtures__/forbidden-service-patterns.json';
import { parsePubchiBotV1 } from './bot';
import { scanForbiddenPublicState,SECRET_VALUE_PATTERNS } from './forbidden';

const fixtures = import.meta.glob('./__fixtures__/forbidden/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

describe('scanForbiddenPublicState', () => {
  it('keeps secret-value patterns aligned with the service list', () => {
    expect(SECRET_VALUE_PATTERNS.map((pattern) => pattern.source)).toEqual(servicePatterns);
  });

  it('rejects secret-shaped public values', () => {
    expect(scanForbiddenPublicState('sk-abcdefghijklmnopqrstuvwxyz')).toEqual({
      ok: false,
      code: 'FORBIDDEN_SECRET',
    });
  });
  it('matches the service verdict encoded by every shared fixture filename', () => {
    for (const [path, fixture] of Object.entries(fixtures)) {
      const expected = path.match(/__([A-Z_]+)__/)?.[1];
      expect(expected, path).toBeTruthy();
      const result = scanForbiddenPublicState(fixture);
      expect(result.ok ? undefined : result.code, path).toBe(expected);
      if (path.includes('/bot__')) {
        expect(parsePubchiBotV1(fixture).ok, path).toBe(false);
      }
    }
  });

  it('rejects objects deeper than the service scan limit', () => {
    let value: unknown = 'safe';
    for (let depth = 0; depth <= 64; depth += 1) value = { nested: value };

    expect(scanForbiddenPublicState(value)).toEqual({ ok: false, code: 'SCHEMA_INVALID' });
  });
});
