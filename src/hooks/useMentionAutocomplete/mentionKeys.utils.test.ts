import { describe, expect, it } from 'vitest';
import { findKeys, isCompleteKey, keyFromPaste, truncateKey } from './mentionKeys.utils';

const KEY = 'operrr8wsbpr3ue9d4qj41ge1kcc6r7fdiy6o3ugjrrhi4y77rdo';
const OTHER = 'oojdj73roegeh7r5h59s91qpn8g54j9u8j3q8fdguwy9hb1gy9ao';

describe('isCompleteKey', () => {
  it('accepts a complete key', () => {
    expect(isCompleteKey(KEY)).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(isCompleteKey(KEY.slice(0, 51))).toBe(false);
    expect(isCompleteKey(`${KEY}y`)).toBe(false);
  });

  it('rejects characters outside the z-base-32 alphabet', () => {
    // l, v, 0 and 2 are not in the z32 alphabet
    for (const bad of ['l', 'v', '0', '2']) {
      expect(isCompleteKey(bad + KEY.slice(1))).toBe(false);
    }
  });
});

describe('keyFromPaste — the four shapes John asked for', () => {
  it('bare key', () => {
    expect(keyFromPaste(KEY)).toBe(KEY);
  });

  it('pubky prefix, no colon', () => {
    expect(keyFromPaste(`pubky${KEY}`)).toBe(KEY);
  });

  it('legacy pk: prefix', () => {
    expect(keyFromPaste(`pk:${KEY}`)).toBe(KEY);
  });

  it('pubky:// URI', () => {
    expect(keyFromPaste(`pubky://${KEY}`)).toBe(KEY);
  });

  it('profile URL', () => {
    expect(keyFromPaste(`https://pubky.app/profile/${KEY}`)).toBe(KEY);
  });

  it('tolerates surrounding whitespace', () => {
    expect(keyFromPaste(`  ${KEY}\n`)).toBe(KEY);
  });

  it('refuses a paragraph that merely contains a key', () => {
    expect(keyFromPaste(`hello ${KEY} there`)).toBeNull();
  });

  it('refuses a paste of two keys', () => {
    expect(keyFromPaste(`${KEY} ${OTHER}`)).toBeNull();
  });

  it('refuses text that is not a key', () => {
    expect(keyFromPaste('just some words')).toBeNull();
    expect(keyFromPaste('')).toBeNull();
  });
});

describe('findKeys', () => {
  it('finds a key mid-sentence and reports its full range including prefix', () => {
    const text = `cc pubky${KEY} please`;
    const [found] = findKeys(text);
    expect(found.key).toBe(KEY);
    expect(text.slice(found.start, found.end)).toBe(`pubky${KEY}`);
  });

  it('finds several keys in order', () => {
    expect(findKeys(`${KEY} and pk:${OTHER}`).map((m) => m.key)).toEqual([KEY, OTHER]);
  });

  it('finds nothing in ordinary prose', () => {
    expect(findKeys('no keys here at all')).toEqual([]);
  });
});

describe('truncateKey', () => {
  it('shows the ends and hides the middle', () => {
    expect(truncateKey(KEY)).toBe('oper…7rdo');
    expect(truncateKey(KEY)).not.toContain(KEY.slice(10, 20));
  });
});
