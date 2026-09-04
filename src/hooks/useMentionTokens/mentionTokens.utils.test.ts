import { describe, expect, it } from 'vitest';
import {
  findTokens,
  insertToken,
  type MentionToken,
  reconcile,
  renderToken,
  SENTINEL,
  tokenEndingAt,
  toStorage,
  visibleLength,
} from './mentionTokens.utils';

const ALICE: MentionToken = { name: 'alice', key: 'nkcct8tzquo8n4z5ysz9t963ye9kq1w7gb55aad1z4tmsgjjhmto' };
const BOB: MentionToken = { name: 'bob', key: 'operrr8wsbpr3ue9d4qj41ge1kcc6r7fdiy6o3ugjrrhi4y77rdo' };

describe('the separator', () => {
  it('is the invisible separator U+2063', () => {
    expect(SENTINEL).toBe('⁣');
    expect(SENTINEL).toHaveLength(1);
  });
});

describe('what the writer sees', () => {
  it('shows a name, never a key', () => {
    const display = 'hey ' + renderToken('alice');
    expect(display).toContain('@alice');
    expect(display).not.toContain(ALICE.key);
  });

  it('does not count the invisible separators as characters', () => {
    expect(visibleLength(renderToken('alice'))).toBe('@alice'.length);
  });
});

describe('what the post stores', () => {
  it('turns a mention back into the pubky format', () => {
    const display = 'hey ' + renderToken('alice') + ' welcome';
    expect(toStorage(display, [ALICE])).toBe('hey pubky' + ALICE.key + '  welcome');
  });

  it('keeps two mentions paired with their own keys', () => {
    const display = renderToken('alice') + ' and ' + renderToken('bob');
    const stored = toStorage(display, [ALICE, BOB]);
    expect(stored).toContain('pubky' + ALICE.key);
    expect(stored).toContain('pubky' + BOB.key);
    expect(stored.indexOf(ALICE.key)).toBeLessThan(stored.indexOf(BOB.key));
  });

  it('pairs duplicate display names with the right keys, in order', () => {
    const twin: MentionToken = { name: 'alice', key: BOB.key };
    const display = renderToken('alice') + ' vs ' + renderToken('alice');
    const stored = toStorage(display, [ALICE, twin]);
    expect(stored.indexOf(ALICE.key)).toBeLessThan(stored.indexOf(BOB.key));
  });

  it('leaves a hand-typed @alice as plain text', () => {
    expect(toStorage('hey @alice', [])).toBe('hey @alice');
  });

  it('never silently drops an unresolved mention', () => {
    const orphan = renderToken('ghost');
    expect(toStorage(orphan, [])).toBe('@ghost');
  });

  it('leaves content with no mentions untouched', () => {
    expect(toStorage('just a normal post', [])).toBe('just a normal post');
  });
});

describe('editing', () => {
  it('drops a mention the writer deleted', () => {
    const display = renderToken('alice');
    expect(reconcile(display, [ALICE, BOB])).toEqual([ALICE]);
  });

  it('inserts at a range and puts the caret after the mention', () => {
    const { text, caret } = insertToken('hey @ali', 4, 8, 'alice');
    expect(text).toBe('hey ' + renderToken('alice') + ' ');
    expect(text.slice(caret)).toBe('');
    expect(text).not.toContain('@ali ');
  });

  it('inserts mid-text without disturbing what follows', () => {
    const { text } = insertToken('hey @ali there', 4, 8, 'alice');
    expect(text).toBe('hey ' + renderToken('alice') + '  there');
  });

  it('recognises a mention ending at the caret so it deletes whole', () => {
    const display = 'hey ' + renderToken('alice');
    const span = tokenEndingAt(display, display.length);
    expect(span).not.toBeNull();
    expect(display.slice(span!.start, span!.end)).toBe(renderToken('alice'));
  });

  it('reports nothing when the caret is not at the end of a mention', () => {
    expect(tokenEndingAt('hey ' + renderToken('alice') + ' more', 3)).toBeNull();
  });
});

describe('finding spans', () => {
  it('handles names containing spaces', () => {
    const display = renderToken('Alice Example');
    expect(findTokens(display)[0].name).toBe('Alice Example');
  });
});
