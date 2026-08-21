'use client';

import { type ReactNode } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import type { UseEncryptedConversationReturn } from '@/hooks/useEncryptedConversation/useEncryptedConversation.types';
import { cn } from '@/libs/utils/utils';

/**
 * The shared thread + composer of one end-to-end-encrypted conversation:
 * message bubbles from device-local history, the live byte-budget composer,
 * and the honest storage disclosure. Used by the marketplace listing
 * conversation dialog and the general DM conversation page — both ride the
 * same Encrypted Link transport, so the body is one component with the
 * context-specific copy passed in.
 */
export function EncryptedConversationBody({
  conversation,
  counterpartyLabel,
  composerDisabled,
  composerPlaceholder = 'Is this still available?',
  emptyPrompt = 'Ask about condition, shipping, or item details. Do not share payment credentials.',
  children,
}: {
  conversation: UseEncryptedConversationReturn;
  counterpartyLabel: string;
  composerDisabled: boolean;
  composerPlaceholder?: string;
  emptyPrompt?: string;
  children?: ReactNode;
}) {
  const overBudget = conversation.draftBytes > conversation.bodyBudgetBytes;

  return (
    <>
      <div aria-live="polite" className="max-h-80 space-y-3 overflow-y-auto rounded-xl border bg-card/50 p-4">
        {conversation.messages.length ? (
          conversation.messages.map((message) => {
            const mine = message.direction === 'sent';
            return (
              <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2 text-sm',
                    mine ? 'bg-brand text-primary-foreground' : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  <Typography as="p" overrideDefaults className="text-sm break-words whitespace-pre-wrap">
                    {message.body}
                  </Typography>
                </div>
              </div>
            );
          })
        ) : (
          <Typography as="p" className="py-8 text-center text-sm text-muted-foreground">
            {composerDisabled ? `No messages yet with ${counterpartyLabel}.` : emptyPrompt}
          </Typography>
        )}
      </div>

      {children}

      {!composerDisabled && (
        <>
          <div className="grid gap-1">
            <label htmlFor="encrypted-message-body" className="text-sm font-medium">
              Message
            </label>
            <textarea
              id="encrypted-message-body"
              rows={3}
              value={conversation.draft}
              onChange={(event) => conversation.setDraft(event.target.value)}
              placeholder={composerPlaceholder}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1"
            />
            <Typography
              as="p"
              overrideDefaults
              aria-live="polite"
              className={cn('text-right text-xs', overBudget ? 'text-destructive' : 'text-muted-foreground')}
            >
              {conversation.draftBytes} / {conversation.bodyBudgetBytes} bytes
            </Typography>
          </div>

          {conversation.sendError && (
            <Typography as="p" role="alert" className="text-sm text-destructive">
              {conversation.sendError}
            </Typography>
          )}

          <div className="flex items-center justify-between gap-3">
            <Typography as="p" overrideDefaults className="text-xs text-muted-foreground">
              No attachments here: one encrypted message is capped at 1,000 bytes, too small for images.
            </Typography>
            <Button
              className="rounded-full"
              onClick={() => void conversation.send()}
              disabled={conversation.isSending || !conversation.draft.trim() || overBudget}
              aria-busy={conversation.isSending}
            >
              {conversation.isSending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Send className="mr-2 size-4" />
              )}
              {conversation.isSending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </>
      )}

      <Typography as="p" overrideDefaults className="text-xs text-muted-foreground">
        Messages travel as ciphertext; no service operator can read them. History and the local encryption keys live
        only in this browser — clearing site data deletes them, and no other device can show this conversation.
      </Typography>
    </>
  );
}
