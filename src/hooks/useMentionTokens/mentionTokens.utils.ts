/**
 * Display/storage conversion for composer mentions.
 *
 * The composer shows a person's name; a post stores their key. These helpers
 * keep the two in step so a writer never sees 52 characters of z-base-32,
 * while published posts keep the exact `pubky<key>` format every other client
 * already reads.
 *
 * A mention is wrapped in an invisible separator (U+2063) so its extent is
 * unambiguous even when a display name contains spaces or two people share a
 * name. The separator cannot be typed by accident, which keeps a hand-typed
 * "@alice" plain text rather than silently becoming a mention.
 */

/** Invisible separator marking the bounds of a mention in the display text. */
export const SENTINEL = '⁣';

/** Prefix a post stores before a key. Matches pubky-app's current format. */
export const STORAGE_PREFIX = 'pubky';

export interface MentionToken {
  /** Display name shown to the writer. */
  name: string;
  /** The 52-character pubky this mention resolves to. */
  key: string;
}

const SPAN = new RegExp(SENTINEL + '@([^' + SENTINEL + ']*)' + SENTINEL, 'g');

/** Render one mention as it appears in the textarea, separators included. */
export function renderToken(name: string): string {
  return SENTINEL + '@' + name + SENTINEL;
}

/** Every mention span in the display text, in document order. */
export function findTokens(display: string): { name: string; start: number; end: number }[] {
  const spans: { name: string; start: number; end: number }[] = [];
  for (const match of display.matchAll(SPAN)) {
    if (match.index === undefined) continue;
    spans.push({ name: match[1], start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

/**
 * Drop mentions whose span the writer has deleted.
 *
 * Spans are matched to tokens in document order, so duplicate display names
 * stay correctly paired with their own keys.
 */
export function reconcile(display: string, tokens: MentionToken[]): MentionToken[] {
  const spans = findTokens(display);
  const remaining = [...tokens];
  return spans.map((span) => {
    const at = remaining.findIndex((token) => token.name === span.name);
    return at === -1 ? { name: span.name, key: '' } : remaining.splice(at, 1)[0];
  });
}

/**
 * Convert what the writer sees into what the post stores.
 *
 * Unresolved mentions (no key) are written back as plain text so a post never
 * silently loses them.
 */
export function toStorage(display: string, tokens: MentionToken[]): string {
  const ordered = reconcile(display, tokens);
  let index = 0;
  return display.replace(SPAN, (_full, name: string) => {
    const token = ordered[index++];
    return token && token.key ? STORAGE_PREFIX + token.key + ' ' : '@' + name;
  });
}

/**
 * Replace the range [start, end) with a mention and report the new caret
 * position, which sits just after the inserted mention and its trailing space.
 */
export function insertToken(
  display: string,
  start: number,
  end: number,
  name: string,
): { text: string; caret: number } {
  const token = renderToken(name) + ' ';
  return {
    text: display.slice(0, start) + token + display.slice(end),
    caret: start + token.length,
  };
}

/**
 * The mention span ending exactly at `caret`, if there is one.
 *
 * Used to delete a mention whole rather than letting a writer backspace into
 * the middle of it and leave something that will never resolve.
 */
export function tokenEndingAt(display: string, caret: number): { start: number; end: number } | null {
  const span = findTokens(display).find((candidate) => candidate.end === caret);
  return span ? { start: span.start, end: span.end } : null;
}

/** The display text with its invisible separators removed. */
export function visibleText(display: string): string {
  return display.split(SENTINEL).join('');
}

/** Visible length, ignoring the invisible separators, for character counting. */
export function visibleLength(display: string): number {
  return display.split(SENTINEL).join('').length;
}
