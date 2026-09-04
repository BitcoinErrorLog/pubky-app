'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { keyFromPaste } from '@/hooks/useMentionAutocomplete/mentionKeys.utils';
import { insertToken, type MentionToken, reconcile, tokenEndingAt, toStorage } from './mentionTokens.utils';

interface UseMentionTokensParams {
  /** Storage-format content owned by usePostInput. Stays `pubky<key>`. */
  content: string;
  setContent: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Resolve a key to a display name. Returns null when unknown. */
  resolveName: (key: string) => Promise<string | null>;
}

/**
 * Owns the composer's *display* text while `content` keeps the storage format.
 *
 * The writer sees names; `content` keeps `pubky<key>` exactly as before, so
 * submitting, drafts, validation and every other consumer are untouched.
 */
export function useMentionTokens({ content, setContent, textareaRef, resolveName }: UseMentionTokensParams) {
  const [display, setDisplay] = useState(content);
  const displayRef = useRef(content);
  const writtenRef = useRef(content);
  const tokensRef = useRef<MentionToken[]>([]);

  /** Push a new display string, reconcile its mentions, and mirror to storage. */
  const commit = useCallback(
    (nextDisplay: string, nextTokens?: MentionToken[]) => {
      const tokens = reconcile(nextDisplay, nextTokens ?? tokensRef.current);
      tokensRef.current = tokens;
      const storage = toStorage(nextDisplay, tokens);
      displayRef.current = nextDisplay;
      writtenRef.current = storage;
      setDisplay(nextDisplay);
      setContent(storage);
    },
    [setContent],
  );

  /**
   * Follow content changed from outside the composer — cleared after posting,
   * or replaced when a draft or an edit loads. Without this the composer keeps
   * showing text the app has already discarded.
   */
  useEffect(() => {
    if (content === writtenRef.current) return;
    writtenRef.current = content;
    displayRef.current = content;
    tokensRef.current = [];
    setDisplay(content);
  }, [content]);

  /** Move the caret after React has painted the new value. */
  const setCaret = useCallback(
    (position: number) => {
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(position, position);
      });
    },
    [textareaRef],
  );

  /** Ordinary typing. */
  const handleChange = useCallback(
    (value: string) => {
      commit(value);
    },
    [commit],
  );

  /** Replace [start, end) with a mention for `key`, shown as `name`. */
  const addMention = useCallback(
    (key: string, name: string, start: number, end: number) => {
      const { text, caret } = insertToken(display, start, end, name);
      commit(text, [...tokensRef.current, { name, key }]);
      setCaret(caret);
    },
    [display, commit, setCaret],
  );

  /**
   * Delete a whole mention when backspacing at its trailing edge, so a writer
   * cannot leave a half-deleted mention that will never resolve.
   *
   * Returns true when it handled the keystroke.
   */
  const handleBackspace = useCallback(
    (caret: number, hasSelection: boolean): boolean => {
      if (hasSelection) return false;
      const span = tokenEndingAt(display, caret);
      if (!span) return false;
      const next = display.slice(0, span.start) + display.slice(span.end);
      commit(next);
      setCaret(span.start);
      return true;
    },
    [display, commit, setCaret],
  );

  /**
   * Convert a pasted key into a mention. Returns true when the paste was a
   * key and has been handled; false to let the default paste happen.
   */
  const handlePaste = useCallback(
    async (pasted: string, start: number, end: number): Promise<boolean> => {
      const key = keyFromPaste(pasted);
      if (!key) return false;
      const name = await resolveName(key);
      addMention(key, name ?? key, start, end);
      return true;
    },
    [resolveName, addMention],
  );

  /**
   * Replace the partial query the writer was typing with a finished mention.
   *
   * The range is measured against the live display rather than a value captured
   * before the profile lookup, so an intervening keystroke cannot misplace it.
   */
  const addMentionForQuery = useCallback(
    (key: string, name: string) => {
      const current = displayRef.current;
      const match = current.match(/(?:@|pk:|pubky)[^\s]*$/);
      const start = match?.index ?? current.length;
      const { text, caret } = insertToken(current, start, current.length, name);
      commit(text, [...tokensRef.current, { name, key }]);
      setCaret(caret);
    },
    [commit, setCaret],
  );

  /** Replace the display wholesale, e.g. when a draft or edit loads. */
  const resetDisplay = useCallback(
    (value: string) => {
      tokensRef.current = [];
      displayRef.current = value;
      setDisplay(value);
      setContent(value);
    },
    [setContent],
  );

  return { display, handleChange, addMention, addMentionForQuery, handleBackspace, handlePaste, resetDisplay };
}
