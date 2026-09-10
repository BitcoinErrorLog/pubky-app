const PUBKY_ID = '[ybndrfg8ejkmcpqxot1uwisza345h769]{52}';

export const POST_REFERENCE_PATTERN = new RegExp(
  `^(?:pubky://(${PUBKY_ID})/pub/pubky\\.app/posts/([^/?#\\s]+)|https://(?:pubky\\.app|bots\\.pubky\\.app|${typeof window !== 'undefined' ? window.location.host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : 'localhost'})/post/(${PUBKY_ID})/([^/?#\\s]+))$`,
);

export type PostReference = { uri: string; pubky: string; postId: string };

export function parsePostReference(value: string): PostReference | null {
  const match = value.trim().match(POST_REFERENCE_PATTERN);
  if (!match) return null;
  const pubky = match[1] ?? match[3];
  const postId = match[2] ?? match[4];
  if (!pubky || !postId) return null;
  return { uri: `pubky://${pubky}/pub/pubky.app/posts/${postId}`, pubky, postId };
}

export function linkifyPubkys(text: string): Array<string | { pubky: string; href: string }> {
  const parts = text.split(/(pubky:[ybndrfg8ejkmcpqxot1uwisza345h769]{52})/g);
  return parts.map((part) => {
    if (!part.startsWith('pubky:')) return part;
    const pubky = part.slice('pubky:'.length);
    return { pubky, href: `/profile/${pubky}` };
  });
}

export const PUBCHI_CURSOR_STORAGE_PREFIX = 'pubchi-cursor:';

export function readLocalCursor(owner: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(`${PUBCHI_CURSOR_STORAGE_PREFIX}${owner}`);
}

export function writeLocalCursor(owner: string, cursor: string): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(`${PUBCHI_CURSOR_STORAGE_PREFIX}${owner}`, cursor);
}

export function clearLocalCursors(): void {
  if (typeof window === 'undefined') return;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(PUBCHI_CURSOR_STORAGE_PREFIX)) window.localStorage.removeItem(key);
  }
}
