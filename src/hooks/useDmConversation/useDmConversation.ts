'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCommercePollIntervalMs } from '@/config/commerce';
import { MessagingController } from '@/controllers/messaging/messaging';
import { bodyByteSize } from '@/libs/commerce/messaging-contracts';
import { getErrorMessage } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { buildDmConversationId, dmBodyBudget } from '@/libs/messaging/dm-contracts';
import type { CommerceMessagingMessageModelSchema } from '@/models/messaging/messaging.schema';
import type { MessagingLinkState } from '@/services/paykit/paykit-messaging';
import { useMessagingStore } from '@/stores/messaging/messaging.store';
import type { UseEncryptedConversationReturn } from '../useEncryptedConversation/useEncryptedConversation.types';

/**
 * Drives one general direct-message conversation while its surface is OPEN.
 * Same shape and same truthful states as the marketplace's
 * `useEncryptedConversation` — the two ride the same Encrypted Link per
 * counterparty; only the message kind and the conversation identity differ
 * (a DM conversation is keyed by the counterparty pubky, no listing).
 *
 * Polling is bounded and abortable by construction — it runs only while
 * `active` is true AND the page is visible, resumes on focus, and stops on
 * unmount. There is no background polling. While the surface shows messages
 * it also moves the device-local read checkpoint, keeping the unread badge
 * honest.
 */
export function useDmConversation(counterpartyPubky: string, active: boolean): UseEncryptedConversationReturn {
  const enabledPubky = useMessagingStore((state) => state.enabledPubky);
  const [status, setStatus] = useState<UseEncryptedConversationReturn['status']>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<CommerceMessagingMessageModelSchema[]>([]);
  const [receiverProvisioned, setReceiverProvisioned] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const conversationId = useMemo(() => buildDmConversationId(counterpartyPubky), [counterpartyPubky]);
  // The DM envelope has no variable-width fields outside the body, so the
  // budget is a stable constant.
  const bodyBudgetBytes = useMemo(() => dmBodyBudget(), []);
  const draftBytes = useMemo(() => bodyByteSize(draft.trim()), [draft]);

  const loadMessages = useCallback(async () => {
    try {
      const history = await MessagingController.getConversationMessages(conversationId);
      setMessages(history);
      if (history.length > 0) {
        // The surface is open and showing these rows: advance the read checkpoint.
        await MessagingController.markConversationRead(conversationId);
      }
    } catch (error) {
      Logger.warn('Failed to load local DM history', { error });
    }
  }, [conversationId]);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: number | null = null;

    const applyLinkState = (state: MessagingLinkState) => {
      if (cancelled) return;
      if (state.status === 'ready') setStatus('ready');
      else if (state.status === 'not-enrolled') setStatus('not-enrolled');
      else setStatus(state.role === 'initiator' ? 'handshaking-initiator' : 'handshaking-responder');
    };

    const poll = async () => {
      if (cancelled || document.hidden) return;
      try {
        const { state, received } = await MessagingController.pollDmConversation(counterpartyPubky);
        applyLinkState(state);
        if (received.length > 0) await loadMessages();
      } catch (error) {
        if (cancelled) return;
        Logger.error('DM conversation poll failed', { error });
        setErrorMessage(getErrorMessage(error));
        setStatus('error');
      }
    };

    const begin = async () => {
      setStatus('loading');
      setErrorMessage(null);
      await loadMessages();
      try {
        const messagingStatus = await MessagingController.getMessagingStatus();
        if (cancelled) return;
        setReceiverProvisioned(messagingStatus.receiverProvisioned);
        if (!messagingStatus.sessionActive) {
          setStatus('needs-enable');
          return;
        }
        const opened = await MessagingController.openDmConversation(counterpartyPubky);
        applyLinkState(opened.state);
      } catch (error) {
        if (cancelled) return;
        Logger.error('Failed to open the DM conversation', { error });
        setErrorMessage(getErrorMessage(error));
        setStatus('error');
        return;
      }
      // Poll only while this surface stays open and visible; a hidden tab
      // pauses (the visibility listener resumes it on focus).
      timer = window.setInterval(() => void poll(), getCommercePollIntervalMs());
    };

    const onVisibilityChange = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    void begin();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [active, enabledPubky, refreshNonce, counterpartyPubky, loadMessages]);

  const send = useCallback(async (): Promise<boolean> => {
    const body = draft.trim();
    if (!body || isSending) return false;
    if (draftBytes > bodyBudgetBytes) {
      setSendError(`Message is ${draftBytes - bodyBudgetBytes} bytes over the encrypted transport limit.`);
      return false;
    }
    setIsSending(true);
    setSendError(null);
    try {
      await MessagingController.sendDmMessage(counterpartyPubky, body);
      setDraft('');
      await loadMessages();
      return true;
    } catch (error) {
      Logger.error('Failed to send a direct message', { error });
      // The draft is kept: a failed send loses nothing the user typed.
      setSendError(getErrorMessage(error));
      return false;
    } finally {
      setIsSending(false);
    }
  }, [draft, isSending, draftBytes, bodyBudgetBytes, counterpartyPubky, loadMessages]);

  const refresh = useCallback(() => setRefreshNonce((nonce) => nonce + 1), []);

  return {
    status,
    errorMessage,
    messages,
    receiverProvisioned,
    draft,
    setDraft,
    bodyBudgetBytes,
    draftBytes,
    isSending,
    sendError,
    send,
    refresh,
  };
}
