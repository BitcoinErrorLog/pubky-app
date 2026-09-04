import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMentionTokens } from './useMentionTokens';

const ALICE_KEY = 'nkcct8tzquo8n4z5ysz9t963ye9kq1w7gb55aad1z4tmsgjjhmto';

/** Drives the hook the way the composer does, tracking storage-format content. */
function setup(resolve: (key: string) => Promise<string | null> = async () => 'alice') {
  const store = { content: '' };
  const setContent = vi.fn((value: string) => {
    store.content = value;
  });
  const textareaRef = { current: null };
  const hook = renderHook(() => useMentionTokens({ content: '', setContent, textareaRef, resolveName: resolve }));
  return { hook, store, setContent };
}

describe('what the writer sees vs what the post stores', () => {
  it('picking someone shows a name and stores a key', async () => {
    const { hook, store } = setup();

    act(() => {
      hook.result.current.handleChange('hey @ali');
    });
    act(() => {
      hook.result.current.addMention(ALICE_KEY, 'alice', 4, 8);
    });

    await waitFor(() => expect(hook.result.current.display).toContain('@alice'));

    // The writer never sees the key...
    expect(hook.result.current.display).not.toContain(ALICE_KEY);
    // ...but the post carries it, in the format every other client reads.
    expect(store.content).toContain('pubky' + ALICE_KEY);
  });

  it('pasting a bare key becomes a mention', async () => {
    const { hook, store } = setup();

    let handled = false;
    await act(async () => {
      handled = await hook.result.current.handlePaste(ALICE_KEY, 0, 0);
    });

    expect(handled).toBe(true);
    expect(hook.result.current.display).toContain('@alice');
    expect(hook.result.current.display).not.toContain(ALICE_KEY);
    expect(store.content).toContain('pubky' + ALICE_KEY);
  });

  it('pasting a prefixed key becomes the same mention', async () => {
    const { hook, store } = setup();
    await act(async () => {
      await hook.result.current.handlePaste('pubky' + ALICE_KEY, 0, 0);
    });
    expect(store.content).toContain('pubky' + ALICE_KEY);
    expect(hook.result.current.display).toContain('@alice');
  });

  it('pasting ordinary text is left alone', async () => {
    const { hook } = setup();
    let handled = true;
    await act(async () => {
      handled = await hook.result.current.handlePaste('just some words', 0, 0);
    });
    expect(handled).toBe(false);
    expect(hook.result.current.display).toBe('');
  });

  it('falls back to the key as a label when no profile resolves', async () => {
    const { hook, store } = setup(async () => null);
    await act(async () => {
      await hook.result.current.handlePaste(ALICE_KEY, 0, 0);
    });
    // Still a real mention that posts correctly, even with no name to show.
    expect(store.content).toContain('pubky' + ALICE_KEY);
  });
});

describe('replacing the query being typed', () => {
  it('replaces the typed query rather than appending to it', async () => {
    const { hook, store } = setup(async () => 'iso');

    act(() => {
      hook.result.current.handleChange('@iso');
    });
    await act(async () => {
      hook.result.current.addMentionForQuery(ALICE_KEY, 'iso');
    });

    // Regression: a name containing "s" once defeated the query regex, leaving
    // the typed text in place and appending a second mention after it.
    expect(hook.result.current.display).not.toMatch(/@iso[^⁣]*@iso/);
    expect(hook.result.current.display.match(/@iso/g)).toHaveLength(1);
    expect(store.content).toContain('pubky' + ALICE_KEY);
    expect(store.content).not.toContain('@iso');
  });

  it('replaces a partial query mid-word', async () => {
    const { hook } = setup(async () => 'alice');
    act(() => {
      hook.result.current.handleChange('hey @ali');
    });
    await act(async () => {
      hook.result.current.addMentionForQuery(ALICE_KEY, 'alice');
    });
    expect(hook.result.current.display).toContain('hey ');
    expect(hook.result.current.display).not.toContain('@ali⁣');
    expect(hook.result.current.display.match(/@/g)).toHaveLength(1);
  });
});

describe('deleting a mention', () => {
  it('removes the whole mention in one backspace', async () => {
    const { hook, store } = setup();

    await act(async () => {
      await hook.result.current.handlePaste(ALICE_KEY, 0, 0);
    });
    const withMention = hook.result.current.display;
    // Caret sits just after the mention, before its trailing space.
    const caret = withMention.trimEnd().length;

    let handled = false;
    act(() => {
      handled = hook.result.current.handleBackspace(caret, false);
    });

    expect(handled).toBe(true);
    expect(hook.result.current.display).not.toContain('@alice');
    expect(store.content).not.toContain(ALICE_KEY);
  });

  it('leaves ordinary backspace alone', () => {
    const { hook } = setup();
    act(() => {
      hook.result.current.handleChange('plain text');
    });
    let handled = true;
    act(() => {
      handled = hook.result.current.handleBackspace(5, false);
    });
    expect(handled).toBe(false);
  });
});
