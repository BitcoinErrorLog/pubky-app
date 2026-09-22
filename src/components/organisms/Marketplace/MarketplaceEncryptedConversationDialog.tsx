'use client';

import { type ReactNode, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { useEncryptedConversation } from '@/hooks/useEncryptedConversation/useEncryptedConversation';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { marketplaceCounterpartyLabel, MESSAGING_COPY } from '@/libs/commerce/messaging-copy';
import { EncryptedConversationBody } from '@/organisms/Messaging/EncryptedConversationBody';
import { useAuthStore } from '@/stores/auth/auth.store';
import { MarketplaceMessagingEnablePanel } from './MarketplaceMessagingEnableDialog';

/**
 * One listing conversation on Encrypted Links. Attachments are not offered:
 * durable chat is text-only in this phase.
 */
export function MarketplaceEncryptedConversationDialog({
  sellerPubky,
  buyerPubky,
  listingId,
  counterpartyPubky,
  trigger,
  defaultOpen = false,
  showListingDisclosure = false,
}: {
  sellerPubky: string;
  buyerPubky: string;
  listingId: string;
  counterpartyPubky: string;
  trigger: ReactNode;
  defaultOpen?: boolean;
  showListingDisclosure?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { requireAuth } = useRequireAuth();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const conversation = useEncryptedConversation(sellerPubky, buyerPubky, listingId, open);
  const { userDetails } = useUserDetails(counterpartyPubky);
  const counterpartyLabel = marketplaceCounterpartyLabel({
    profileName: userDetails?.name,
    counterpartyIsSeller: counterpartyPubky === sellerPubky,
  });
  const notEnrolledCopy =
    currentUserPubky === sellerPubky ? MESSAGING_COPY.notEnrolledBuyer : MESSAGING_COPY.notEnrolledSeller;

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
      <DialogContent className="border-border bg-popover sm:max-w-xl" data-surface="marketplace-encrypted-conversation">
        <DialogHeader>
          <DialogTitle>{counterpartyLabel}</DialogTitle>
        </DialogHeader>

        {showListingDisclosure ? (
          <Typography as="p" className="text-sm text-muted-foreground">
            {MESSAGING_COPY.listingDisclosure}
          </Typography>
        ) : null}

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
              {notEnrolledCopy}
            </Typography>
          </div>
        )}

        {conversation.status === 'handshaking-initiator' && (
          <EncryptedConversationBody conversation={conversation}>
            <Typography
              as="p"
              role="status"
              className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
            >
              {MESSAGING_COPY.handshakeInitiator}
            </Typography>
          </EncryptedConversationBody>
        )}

        {conversation.status === 'handshaking-responder' && (
          <EncryptedConversationBody conversation={conversation}>
            <Typography
              as="p"
              role="status"
              className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
            >
              {MESSAGING_COPY.handshakeResponder}
            </Typography>
          </EncryptedConversationBody>
        )}

        {conversation.status === 'ready' && <EncryptedConversationBody conversation={conversation} />}

        {conversation.status === 'error' && (
          <div className="grid gap-3">
            <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">
              {conversation.errorMessage}
            </div>
            <Button className="w-fit rounded-full" onClick={conversation.refresh}>
              {MESSAGING_COPY.inboxRetry}
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
