'use client';

import { findTokens } from '@/hooks/useMentionTokens/mentionTokens.utils';
import { cn } from '@/libs/utils/utils';

interface MentionHighlightProps {
  /** The exact display string rendered by the textarea this sits behind. */
  value: string;
  className?: string;
}

/**
 * Draws a pill behind each mention in the composer.
 *
 * This mirrors the textarea's text with every glyph transparent and paints a
 * rounded background only behind mention spans, so the textarea's own text
 * still renders on top. Highlighting rather than replacing the text means a
 * small font or padding mismatch shows up as a slightly offset pill instead of
 * doubled or garbled writing.
 *
 * Purely decorative: the textarea remains the accessible control.
 */
export function MentionHighlight({ value, className }: MentionHighlightProps) {
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
