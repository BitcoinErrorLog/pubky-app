import { CirclePlay, FileText, Image as ImageIcon, Newspaper, StickyNote } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { getLockContentDisplay } from './lockContentKind';
import { DEFAULT_LOCK_TITLE } from './lockTeaser';

describe('getLockContentDisplay', () => {
  it.each([
    ['article', 'Locked article', Newspaper],
    ['image', 'Locked image', ImageIcon],
    ['video', 'Locked video', CirclePlay],
    ['file', 'Locked file', FileText],
  ] as const)('maps %s to "%s" and its icon', (kind, title, Icon) => {
    expect(getLockContentDisplay(kind)).toEqual({ title, Icon });
  });

  it.each([['note'], ['link'], [undefined], [null]] as const)('reads %s as generic locked content', (kind) => {
    expect(getLockContentDisplay(kind)).toEqual({ title: DEFAULT_LOCK_TITLE, Icon: StickyNote });
    expect(DEFAULT_LOCK_TITLE).toBe('Locked content');
  });
});
