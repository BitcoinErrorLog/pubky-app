import { describe, expect, it } from 'vitest';
import { scanForbiddenPublicState } from './forbidden';

const fixtures = import.meta.glob('./__fixtures__/forbidden/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

describe('scanForbiddenPublicState', () => {
  it('matches the service verdict encoded by every shared fixture filename', () => {
    for (const [path, fixture] of Object.entries(fixtures)) {
      const expected = path.match(/__([A-Z_]+)__/)?.[1];
      expect(expected, path).toBeTruthy();
      const result = scanForbiddenPublicState(fixture);
      expect(result.ok ? undefined : result.code, path).toBe(expected);
    }
  });
});
