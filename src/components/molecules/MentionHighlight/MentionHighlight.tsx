'use client';

import { useLayoutEffect, useRef } from 'react';
import { findTokens } from '@/hooks/useMentionTokens/mentionTokens.utils';
import { cn } from '@/libs/utils/utils';

interface MentionHighlightProps {
  /** The exact display string rendered by the textarea this sits behind. */
  value: string;
  /** The textarea being mirrored. Its computed styles drive alignment. */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  className?: string;
}

/**
 * Text metrics copied from the textarea so the mirrored text wraps and
 * measures identically. A textarea and a div do not share default font
 * metrics, so matching Tailwind classes alone leaves the pill fractionally
 * narrower than the name it sits behind.
 */
const MIRRORED_STYLES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'wordSpacing',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
] as const;

/**
 * Draws a pill behind each mention in the composer.
 *
 * This mirrors the textarea's text with every glyph transparent and paints a
 * rounded background only behind mention spans, so the textarea's own text
 * still renders on top. Highlighting rather than replacing the text means any
 * residual mismatch shows as a slightly offset pill rather than doubled or
 * garbled writing.
 *
 * Purely decorative: the textarea remains the accessible control.
 */
export function MentionHighlight({ value, textareaRef, className }: MentionHighlightProps) {
  const mirrorRef = useRef<HTMLDivElement>(null);

  // Copy the textarea's real text metrics rather than guessing at matching classes.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;

    const apply = () => {
      const computed = window.getComputedStyle(textarea);
      for (const property of MIRRORED_STYLES) {
        mirror.style[property] = computed[property];
      }
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [textareaRef, value]);

  const spans = findTokens(value);
  const pieces: { text: string; isMention: boolean }[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) pieces.push({ text: value.slice(cursor, span.start), isMention: false });
    pieces.push({ text: value.slice(span.start, span.end), isMention: true });
    cursor = span.end;
  }
  if (cursor < value.length) pieces.push({ text: value.slice(cursor), isMention: false });

  return (
    <div
      ref={mirrorRef}
      aria-hidden="true"
      data-testid="mention-highlight"
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden break-words whitespace-pre-wrap text-transparent',
        className,
      )}
    >
      {pieces.map((piece, index) =>
        piece.isMention ? (
          <span key={index} className="rounded-[0.25rem] bg-brand/20 ring-1 ring-brand/40">
            {piece.text}
          </span>
        ) : (
          <span key={index}>{piece.text}</span>
        ),
      )}
      {/* Trailing newline needs a glyph or the last line collapses. */}
      {value.endsWith('\n') && <span>&nbsp;</span>}
    </div>
  );
}
