'use client';

import { ArrowLeft, LockKeyhole, ShieldAlert } from 'lucide-react';
import { APP_ROUTES, getProfileRoute, PROFILE_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { useDmConversation } from '@/hooks/useDmConversation/useDmConversation';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { MESSAGING_COPY } from '@/libs/commerce/messaging-copy';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceMessagingEnablePanel } from '@/organisms/Marketplace/MarketplaceMessagingEnableDialog';
import { EncryptedConversationBody } from '@/organisms/Messaging/EncryptedConversationBody';
import { useAuthStore } from '@/stores/auth/auth.store';

/**
 * One general direct-message conversation (`/messages/{pubky}`). Same
 * truthful transport states as the marketplace listing dialog — the two ride
 * the same per-counterparty Encrypted Link; only the message kind and the
 * conversation identity differ.
 */
export function MessagesConversation({ counterpartyPubky }: { counterpartyPubky: string }) {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const conversation = useDmConversation(counterpartyPubky, Boolean(currentUserPubky));
  const { userDetails } = useUserDetails(counterpartyPubky);
  const displayName = userDetails?.name?.trim() || 'Direct message';

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28"
      classNameWrapperContent="max-w-3xl"
    >
      <div className="flex w-full flex-col gap-4 px-4 sm:px-6">
        <Link
          href={APP_ROUTES.MESSAGES}
          overrideDefaults
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All messages
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href={getProfileRoute(PROFILE_ROUTES.PROFILE, counterpartyPubky)}
            overrideDefaults
            aria-label="View profile"
          >
            <AvatarWithFallback
              avatarUrl={undefined}
              name={displayName}
              fallbackSeed={counterpartyPubky}
              size="lg"
              alt={displayName}
            />
          </Link>
          <div className="min-w-0">
            <Heading level={1} size="md" className="truncate">
              {displayName}
            </Heading>
          </div>
        </div>

        <Typography as="p" className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
          <LockKeyhole className="size-3.5 shrink-0" aria-hidden />
          {MESSAGING_COPY.inboxSubtitleDurable}
        </Typography>

        {!currentUserPubky ? (
          <Typography as="p" className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
            Sign in to message {displayName}.
          </Typography>
        ) : (
          <div className="flex flex-col gap-4">
            {conversation.status === 'loading' && <Skeleton className="h-48 w-full" />}

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
                  {MESSAGING_COPY.notEnrolledSeller}
                </Typography>
              </div>
            )}

            {conversation.status === 'handshaking-initiator' && (
              <EncryptedConversationBody
                conversation={conversation}
                composerPlaceholder={`Message ${displayName}`}
                emptyPrompt=""
              >
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
              <EncryptedConversationBody
                conversation={conversation}
                composerPlaceholder={`Message ${displayName}`}
                emptyPrompt=""
              >
                <Typography
                  as="p"
                  role="status"
                  className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
                >
                  {MESSAGING_COPY.handshakeResponder}
                </Typography>
              </EncryptedConversationBody>
            )}

            {conversation.status === 'ready' && (
              <EncryptedConversationBody
                conversation={conversation}
                composerPlaceholder={`Message ${displayName}`}
                emptyPrompt="Say hello. Messages are end-to-end encrypted; only the two of you can read them."
              />
            )}

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
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
