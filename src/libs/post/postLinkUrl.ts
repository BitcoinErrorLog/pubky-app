import { LinkifyIt } from 'linkify-it';

/**
 * The link a post's content is about: kind inference classifies it (`link` or
 * `video`), PostLinkEmbeds embeds it, and the Visual layout builds a tile for it
 * when it is a playable video. Sharing one parser keeps the three in agreement.
 */

// Protocol types to ignore when parsing links
const IGNORED_PROTOCOLS = ['ftp:', 'mailto:'];

/**
 * Strip Markdown link syntax from content
 * Removes [text](url) entirely so URLs inside Markdown links aren't detected
 * Handles URLs with nested parentheses (e.g., Wikipedia links like /wiki/Foo_(bar))
 */
const stripMarkdownLinks = (content: string): string => {
  // Pattern handles one level of nested parentheses in URLs
  // [^()]* matches chars that aren't parentheses
  // (?:\([^()]*\)[^()]*)* matches (content) groups and text after them
  return content.replace(/\[([^\]]*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '<stripped-link>');
};

/**
 * First bare URL in the content, or null when there is none.
 * Markdown links, `ftp:` and `mailto:` are skipped; a protocol-less URL comes back with `http://`.
 */
export function getFirstLinkUrl(content: string): string | null {
  // linkify-it v6 defaults fuzzyLink to false; keep matching protocol-less URLs.
  const linkify = new LinkifyIt({ fuzzyLink: true });

  // Disable unwanted protocol types
  IGNORED_PROTOCOLS.forEach((protocol) => linkify.add(protocol, null));

  // Strip Markdown link syntax before parsing
  const match = linkify.match(stripMarkdownLinks(content));

  return match?.[0]?.url ?? null;
}
