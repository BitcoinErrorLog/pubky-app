import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPubchiSigningSeed,
  getPubchiSigningSeedCopy,
  hasPubchiSigningSeed,
  retainPubchiSigningSeed,
  usePubchiSigningAvailable,
} from './signing-seed';

describe('pubchi signing seed holder', () => {
  afterEach(() => {
    clearPubchiSigningSeed();
  });

  it('is empty until a secret-based sign-in retains a seed', () => {
    expect(hasPubchiSigningSeed()).toBe(false);
    expect(getPubchiSigningSeedCopy()).toBeUndefined();
    expect(usePubchiSigningAvailable.getState().available).toBe(false);

    const seed = new Uint8Array(32).fill(7);
    retainPubchiSigningSeed({ secret: () => seed });

    expect(hasPubchiSigningSeed()).toBe(true);
    expect(usePubchiSigningAvailable.getState().available).toBe(true);
    expect(getPubchiSigningSeedCopy()).toEqual(seed);
  });

  it('clears the seed on sign-out', () => {
    retainPubchiSigningSeed({ secret: () => new Uint8Array(32).fill(3) });
    clearPubchiSigningSeed();
    expect(hasPubchiSigningSeed()).toBe(false);
    expect(getPubchiSigningSeedCopy()).toBeUndefined();
    expect(usePubchiSigningAvailable.getState().available).toBe(false);
  });

  it('returns an independent copy so the caller can zeroize it', () => {
    retainPubchiSigningSeed({ secret: () => new Uint8Array(32).fill(9) });
    const copy = getPubchiSigningSeedCopy();
    expect(copy).toBeDefined();
    copy?.fill(0);
    expect(getPubchiSigningSeedCopy()).toEqual(new Uint8Array(32).fill(9));
  });
});
