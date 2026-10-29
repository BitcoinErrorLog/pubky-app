import { CirclePlay, FileText, Image as ImageIcon, type LucideIcon, Newspaper, StickyNote } from 'lucide-react';
import type { TLockContentKind } from '@/services/locks/locks.types';
import { DEFAULT_LOCK_TITLE } from './lockTeaser';

export type TLockContentDisplay = {
  /** Shown when the creator typed no title, and seeded into the composer card. */
  title: string;
  Icon: LucideIcon;
};

const GENERIC_LOCK_CONTENT: TLockContentDisplay = { title: DEFAULT_LOCK_TITLE, Icon: StickyNote };

// Article, image and video icons match the content filter's. Files use FileText, as attachment rows do.
// A note or a link has no label of its own and reads as generic content.
const LOCK_CONTENT_BY_KIND: Partial<Record<TLockContentKind, TLockContentDisplay>> = {
  article: { title: 'Locked article', Icon: Newspaper },
  image: { title: 'Locked image', Icon: ImageIcon },
  video: { title: 'Locked video', Icon: CirclePlay },
  file: { title: 'Locked file', Icon: FileText },
};

/**
 * The icon and default title for a lock, from the kind saved in its announcement (#2433). The one mapping
 * `LockedPostCard` and `DialogPayToUnlock` share. A lock that saved no kind (one from before #2433) reads
 * as generic content.
 */
export function getLockContentDisplay(kind?: TLockContentKind | null): TLockContentDisplay {
  return (kind && LOCK_CONTENT_BY_KIND[kind]) || GENERIC_LOCK_CONTENT;
}
