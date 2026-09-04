/**
 * Pubky key detection for the mention composer.
 *
 * A mention is stored in post content as `pubky<key>` (or legacy `pk:<key>`),
 * but a person pasting a key may bring it in any of several shapes. These
 * helpers find a complete key in pasted or typed text so the composer can
 * convert it to a mention immediately, rather than leaving a raw key in view.
 */

/** z-base-32 alphabet used by pubky identifiers. */
const Z32_ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769';

/** A complete pubky identifier is 52 z-base-32 characters. */
export const PUBKY_KEY_LENGTH = 52;

const BARE_KEY = '[' + Z32_ALPHABET + ']{' + PUBKY_KEY_LENGTH + '}';

/**
 * Every prefix a pasted key may arrive with, longest first so that
 * `pubky://` wins over the bare `pubky` prefix.
 */
const PREFIX = [
  '(?:https?://[^\s/]+)?/profile/', // profile URL, with or without host
  'pubky://', // pubky URI
  'pk:', // legacy mention prefix
  'pubky', // current mention prefix
].join('|');

/** Optional trailing path, so a full URI is consumed rather than half-matched. */
const TRAILING_PATH = '(?:/[^\s]*)?';

const KEY_PATTERN_SOURCE = '(?:' + PREFIX + ')?(' + BARE_KEY + ')' + TRAILING_PATH;

/** True when `value` is exactly one complete pubky key and nothing else. */
export function isCompleteKey(value: string): boolean {
  return new RegExp('^' + BARE_KEY + '$').test(value);
}

/**
 * Extract every complete key from `text`, in order of appearance.
 *
 * Returns the character range of each match including its prefix and any
 * trailing path, so the caller can replace the whole thing — not just the
 * key — with a mention.
 */
export function findKeys(text: string): { key: string; start: number; end: number }[] {
  const found: { key: string; start: number; end: number }[] = [];
  for (const match of text.matchAll(new RegExp(KEY_PATTERN_SOURCE, 'g'))) {
    if (match.index === undefined) continue;
    found.push({ key: match[1], start: match.index, end: match.index + match[0].length });
  }
  return found;
}

/**
 * Pull a single key out of pasted text, ignoring surrounding whitespace.
 *
 * Returns null when the paste is not exactly one key — pasting a paragraph
 * that happens to contain a key should not silently become a mention.
 */
export function keyFromPaste(pasted: string): string | null {
  const trimmed = pasted.trim();
  if (!trimmed) return null;
  const keys = findKeys(trimmed);
  if (keys.length !== 1) return null;
  const [only] = keys;
  return only.start === 0 && only.end === trimmed.length ? only.key : null;
}

/** Shorten a key for display when no profile could be resolved: `oper…7rdo`. */
export function truncateKey(key: string): string {
  return key.slice(0, 4) + '…' + key.slice(-4);
}
