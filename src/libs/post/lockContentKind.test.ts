import { CirclePlay, Download, Image as ImageIcon, Link, Newspaper, StickyNote } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { LOCK_CONTENT_KINDS } from '@/services/locks/locks.types';
import { getLockContentDisplay, isLockContentKind } from './lockContentKind';
import { DEFAULT_LOCK_TITLE } from './lockTeaser';

describe('getLockContentDisplay', () => {
  // The icons are the content filter's, so a lock reads as the same kind the feed filters by.
  it.each([
    ['long', 'Locked article', Newspaper],
    ['image', 'Locked image', ImageIcon],
    ['video', 'Locked video', CirclePlay],
    ['file', 'Locked file', Download],
    ['link', DEFAULT_LOCK_TITLE, Link],
  ] as const)('maps %s to "%s" and its icon', (kind, title, Icon) => {
    expect(getLockContentDisplay(kind)).toEqual({ title, Icon });
  });

  it.each([['short'], ['podcast'], ['collection'], [''], [undefined]] as const)(
    'reads %s as generic locked content',
    (kind) => {
      expect(getLockContentDisplay(kind)).toEqual({ title: DEFAULT_LOCK_TITLE, Icon: StickyNote });
      expect(DEFAULT_LOCK_TITLE).toBe('Locked content');
    },
  );
});

describe('isLockContentKind', () => {
  it('accepts the post kind strings a create can infer, and nothing else', () => {
    expect(LOCK_CONTENT_KINDS).toEqual(['short', 'long', 'image', 'video', 'link', 'file']);
    for (const kind of LOCK_CONTENT_KINDS) expect(isLockContentKind(kind)).toBe(true);
    for (const kind of ['collection', 'unknown', 'note', 'article', 'podcast', '']) {
      expect(isLockContentKind(kind)).toBe(false);
    }
  });
});
