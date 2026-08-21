'use client';

import { type ReactNode, useState } from 'react';
import { Loader2, LockKeyhole, Send, ShieldAlert } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Link } from '@/atoms/Link/Link';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { useEncryptedConversation } from '@/hooks/useEncryptedConversation/useEncryptedConversation';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn } from '@/libs/utils/utils';
import { MarketplaceMessagingEnablePanel } from './MarketplaceMessagingEnableDialog';

/**
 * Provenance of the vendored encrypted transport (pinned commit, checksums,
 * proof coverage, known limitations). Linked from the E2EE label so the
 * "experiment-grade" claim is auditable, not decorative.
 */
const PAYKIT_WASM_PROVENANCE_URL =
  'https://github.com/BitcoinErrorLog/pubky-app/blob/marketplace/pr22-messaging/docs/ecommerce/paykit-wasm-provenance.md';

/**
 * One end-to-end-encrypted listing conversation (durable commerce modes).
 * Every state shown maps to a real transport fact — see
 * `useEncryptedConversation` for the state semantics. Attachments are NOT
 * offered here: one encrypted message is capped at 1000 bytes including its
 * envelope, which forbids inline images; the encrypted-blob pattern the
 * protocol intends for attachments is future work.
 */
export function MarketplaceEncryptedConversationDialog({
  sellerPubky,
  buyerPubky,
  listingId,
  counterpartyPubky,
  trigger,
}: {
  sellerPubky: string;
  buyerPubky: string;
  listingId: string;
  counterpartyPubky: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { requireAuth } = useRequireAuth();
  const conversation = useEncryptedConversation(sellerPubky, buyerPubky, listingId, open);
  const counterpartyLabel = `${counterpartyPubky.slice(0, 10)}…`;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setOpen(false);
          return;
        }
        requireAuth(() => setOpen(true));
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="border-border bg-popover sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Listing conversation</DialogTitle>
        </DialogHeader>

        <Typography as="p" className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          <LockKeyhole className="size-3.5 shrink-0" aria-hidden />
          End-to-end encrypted · history stored on this device ·{' '}
          <Link href={PAYKIT_WASM_PROVENANCE_URL} target="_blank" rel="noreferrer" className="underline">
            experiment-grade transport
          </Link>
        </Typography>

        {conversation.status === 'loading' && <Skeleton className="h-40 w-full" />}

        {conversation.status === 'needs-enable' && (
          <MarketplaceMessagingEnablePanel
            reconnect={conversation.receiverProvisioned}
            onEnabled={conversation.refresh}
          />
        )}

        {conversation.status === 'not-enrolled' && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center">
            <ShieldAlert className="size-8 text-muted-foreground" aria-hidden />
            <Typography as="p" className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{counterpartyLabel}</span> hasn&apos;t enabled encrypted
              messaging yet. Nothing can be delivered to them until they do — this app will not pretend otherwise.
            </Typography>
          </div>
        )}

        {conversation.status === 'handshaking-initiator' && (
          <ConversationBody conversation={conversation} counterpartyLabel={counterpartyLabel} composerDisabled>
            <Typography as="p" role="status" className="text-sm text-muted-foreground">
              Invitation sent — waiting for <span className="font-semibold">{counterpartyLabel}</span> to open their
              encrypted messages. The encrypted handshake needs both sides, so you can write once they answer.
            </Typography>
          </ConversationBody>
        )}

        {conversation.status === 'handshaking-responder' && (
          <ConversationBody conversation={conversation} counterpartyLabel={counterpartyLabel} composerDisabled>
            <Typography as="p" role="status" className="text-sm text-muted-foreground">
              Securing this conversation — answering <span className="font-semibold">{counterpartyLabel}</span>&apos;s
              encrypted handshake. It completes the next time their device checks in.
            </Typography>
          </ConversationBody>
        )}

        {conversation.status === 'ready' && (
          <ConversationBody
            conversation={conversation}
            counterpartyLabel={counterpartyLabel}
            composerDisabled={false}
          />
        )}

        {conversation.status === 'error' && (
          <div className="grid gap-3">
            <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
              {conversation.errorMessage}
            </div>
            <Button className="w-fit rounded-full" onClick={conversation.refresh}>
              Try again
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" className="rounded-full" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConversationBody({
  conversation,
  counterpartyLabel,
  composerDisabled,
  children,
}: {
  conversation: ReturnType<typeof useEncryptedConversation>;
  counterpartyLabel: string;
  composerDisabled: boolean;
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
            {composerDisabled
              ? `No messages yet with ${counterpartyLabel}.`
              : 'Ask about condition, shipping, or item details. Do not share payment credentials.'}
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
              placeholder="Is this still available?"
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
