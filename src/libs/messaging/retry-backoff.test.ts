import { describe, expect, it } from 'vitest';
import { RetryBackoff } from './retry-backoff';

const POLICY = { baseMs: 1_000, maxMs: 8_000 };

describe('RetryBackoff', () => {
  it('doubles the cap per consecutive failure up to the ceiling, jittered into [cap/2, cap]', () => {
    const low = new RetryBackoff<string>(POLICY, () => 0);
    const high = new RetryBackoff<string>(POLICY, () => 1);

    expect([1, 2, 3, 4, 5, 6].map(() => low.fail('k', 'v', 0))).toEqual([500, 1_000, 2_000, 4_000, 4_000, 4_000]);
    expect([1, 2, 3, 4, 5, 6].map(() => high.fail('k', 'v', 0))).toEqual([1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
  });

  it('holds its value while waiting and releases it once the attempt is due', () => {
    const backoff = new RetryBackoff<string>(POLICY, () => 0);
    backoff.fail('k', 'held', 10_000);

    expect(backoff.status('k', 10_499)).toBe('waiting');
    expect(backoff.waiting('k', 10_499)).toBe('held');
    expect(backoff.status('k', 10_500)).toBe('due');
    expect(backoff.waiting('k', 10_500)).toBeUndefined();
  });

  it('keeps keys independent and resets a key on success', () => {
    const backoff = new RetryBackoff<string>(POLICY, () => 0);
    backoff.fail('a', 'held', 0);
    backoff.fail('a', 'held', 0);

    expect(backoff.status('b', 0)).toBe('none');
    backoff.succeed('a');
    expect(backoff.status('a', 0)).toBe('none');
    expect(backoff.fail('a', 'held', 0)).toBe(500);
  });

  it('identifies the value recorded by the latest failure', () => {
    const backoff = new RetryBackoff<{ n: number }>(POLICY);
    const first = { n: 1 };
    const second = { n: 1 };
    backoff.fail('k', first, 0);

    expect(backoff.holds('k', first)).toBe(true);
    expect(backoff.holds('k', second)).toBe(false);
  });
});
