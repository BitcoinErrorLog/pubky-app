const PUBKY_ID = '[ybndrfg8ejkmcpqxot1uwisza345h769]{52}';

export const POST_REFERENCE_PATTERN = new RegExp(
  `(?:pubky://(${PUBKY_ID})/pub/pubky\\.app/posts/([^/?#]+)|https://(?:pubky\\.app|bots\\.pubky\\.app|${typeof window !== 'undefined' ? window.location.host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : 'localhost'})/post/(${PUBKY_ID})/([^/?#]+))`,
);

export type PostReference = { uri: string; pubky: string; postId: string };

export function parsePostReference(value: string): PostReference | null {
  const match = value.trim().match(POST_REFERENCE_PATTERN);
  if (!match) return null;
  const pubky = match[1] ?? match[3];
  const postId = match[2] ?? match[4];
  if (!pubky || !postId) return null;
  return { uri: value.trim(), pubky, postId };
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
