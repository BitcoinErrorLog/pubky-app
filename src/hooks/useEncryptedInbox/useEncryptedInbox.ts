'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessagingMutesState } from '@/application/messaging/first-contact';
import type { MessagingConversationSummary } from '@/application/messaging/messaging';
import { getCommercePollIntervalMs } from '@/config/commerce';
import { MessagingController } from '@/controllers/messaging/messaging';
import { MESSAGING_COPY } from '@/libs/commerce/messaging-copy';
import { getErrorMessage } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useMessagingStore } from '@/stores/messaging/messaging.store';

export type EncryptedInboxStatus = 'loading' | 'needs-enable' | 'ready' | 'error';

export interface UseEncryptedInboxReturn {
  status: EncryptedInboxStatus;
  /** Device-local conversation list — readable even without a live session. */
  conversations: MessagingConversationSummary[];
  /** True when a receiver key exists on this device (reconnect vs first-enable copy). */
  receiverProvisioned: boolean;
  errorMessage: string | null;
  /**
   * Whether the last sync could read the mute list. Anything but `ready` or
   * `unavailable` means new messages were not received this pass.
   */
  mutesStatus: MessagingMutesState['kind'] | null;
  refresh: () => void;
}

/**
 * The encrypted inbox (durable modes): lists device-local conversations and —
 * while a messaging session is live — runs the bounded sync pass that
 * advances pending handshakes, answers queued inbound handshakes from known
 * counterparties, and receives new messages. Sync runs only while this
 * surface is mounted and visible, resumes on focus, and stops on unmount; no
 * background polling.
 *
 * Local history stays readable without a session (it is on this device); the
 * `needs-enable` status only gates live sending/receiving.
 */
export function useEncryptedInbox(): UseEncryptedInboxReturn {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const enabledPubky = useMessagingStore((state) => state.enabledPubky);
  const [status, setStatus] = useState<EncryptedInboxStatus>('loading');
  const [conversations, setConversations] = useState<MessagingConversationSummary[]>([]);
  const [receiverProvisioned, setReceiverProvisioned] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [mutesStatus, setMutesStatus] = useState<MessagingMutesState['kind'] | null>(null);
  // The receive-cap toast fires once per surface, not per sync.
  const rateCapToastShownRef = useRef(false);

  useEffect(() => {
    if (!currentUserPubky) {
      setStatus('loading');
      setConversations([]);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    let syncing = false;

    const loadConversations = async () => {
      const next = await MessagingController.getConversations();
      if (!cancelled) setConversations(next);
    };

    const sync = async () => {
      if (cancelled || document.hidden || syncing) return;
      syncing = true;
      try {
        const messagingStatus = await MessagingController.getMessagingStatus();
        if (cancelled) return;
        setReceiverProvisioned(messagingStatus.receiverProvisioned);
        if (!messagingStatus.sessionActive) {
          await loadConversations();
          if (!cancelled) setStatus('needs-enable');
          return;
        }
        const synced = await MessagingController.syncInbox();
        await loadConversations();
        if (cancelled) return;
        setMutesStatus(synced.mutes);
        setStatus('ready');
        if (synced.rateLimited > 0 && !rateCapToastShownRef.current) {
          rateCapToastShownRef.current = true;
          toast({ variant: 'warning', description: MESSAGING_COPY.rateCap });
        }
      } catch (error) {
        if (cancelled) return;
        Logger.error('Encrypted inbox sync failed', { error });
        setErrorMessage(getErrorMessage(error));
        setStatus('error');
      } finally {
        syncing = false;
      }
    };

    const onVisibilityChange = () => {
      if (!document.hidden) void sync();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    void sync();
    timer = window.setInterval(() => void sync(), getCommercePollIntervalMs());

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [currentUserPubky, enabledPubky, refreshNonce]);

  const refresh = useCallback(() => setRefreshNonce((nonce) => nonce + 1), []);

  return { status, conversations, receiverProvisioned, errorMessage, mutesStatus, refresh };
}
