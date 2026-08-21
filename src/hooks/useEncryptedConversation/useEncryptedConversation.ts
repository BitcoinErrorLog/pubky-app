'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCommercePollIntervalMs } from '@/config/commerce';
import { MessagingController } from '@/controllers/messaging/messaging';
import { bodyByteSize, chatMessageBodyBudget } from '@/libs/commerce/messaging-contracts';
import {
  buildMarketplaceConversationAggregateId,
  buildMarketplaceListingAggregateId,
} from '@/libs/commerce/transaction-commands';
import { getErrorMessage } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import type { CommerceMessagingMessageModelSchema } from '@/models/messaging/messaging.schema';
import type { MessagingLinkState } from '@/services/paykit/paykit-messaging';
import { useMessagingStore } from '@/stores/messaging/messaging.store';
import type { EncryptedConversationStatus, UseEncryptedConversationReturn } from './useEncryptedConversation.types';

/**
 * Drives one encrypted listing conversation while its surface is OPEN:
 * resolves enablement, opens/advances the Encrypted Link, receives messages,
 * and sends. Polling is bounded and abortable by construction — it runs only
 * while `active` is true AND the page is visible, resumes on focus, and stops
 * on unmount. There is no background polling.
 */
export function useEncryptedConversation(
  sellerPubky: string,
  buyerPubky: string,
  listingId: string,
  active: boolean,
): UseEncryptedConversationReturn {
  const enabledPubky = useMessagingStore((state) => state.enabledPubky);
  const [status, setStatus] = useState<EncryptedConversationStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<CommerceMessagingMessageModelSchema[]>([]);
  const [receiverProvisioned, setReceiverProvisioned] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const conversationId = useMemo(
    () => buildMarketplaceConversationAggregateId(sellerPubky, buyerPubky, listingId),
    [sellerPubky, buyerPubky, listingId],
  );
  const listingRef = useMemo(
    () => buildMarketplaceListingAggregateId(sellerPubky, listingId),
    [sellerPubky, listingId],
  );
  const bodyBudgetBytes = useMemo(
    () => chatMessageBodyBudget(conversationId, listingRef),
    [conversationId, listingRef],
  );
  const draftBytes = useMemo(() => bodyByteSize(draft.trim()), [draft]);

  const statusRef = useRef(status);
  statusRef.current = status;

  const loadMessages = useCallback(async () => {
    try {
      const history = await MessagingController.getConversationMessages(conversationId);
      setMessages(history);
      if (history.length > 0) {
        // The surface is open and showing these rows: advance the device-local
        // read checkpoint so the unread badge stays honest.
        await MessagingController.markConversationRead(conversationId);
      }
    } catch (error) {
      Logger.warn('Failed to load local conversation history', { error });
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
        const { state, received } = await MessagingController.pollConversation(sellerPubky, buyerPubky, listingId);
        applyLinkState(state);
        if (received.length > 0) await loadMessages();
      } catch (error) {
        if (cancelled) return;
        Logger.error('Encrypted conversation poll failed', { error });
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
        const opened = await MessagingController.openConversation(sellerPubky, buyerPubky, listingId);
        applyLinkState(opened.state);
      } catch (error) {
        if (cancelled) return;
        Logger.error('Failed to open the encrypted conversation', { error });
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
  }, [active, enabledPubky, refreshNonce, sellerPubky, buyerPubky, listingId, loadMessages]);

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
      await MessagingController.sendMessage(sellerPubky, buyerPubky, listingId, body);
      setDraft('');
      await loadMessages();
      return true;
    } catch (error) {
      Logger.error('Failed to send an encrypted message', { error });
      // The draft is kept: a failed send loses nothing the user typed.
      setSendError(getErrorMessage(error));
      return false;
    } finally {
      setIsSending(false);
    }
  }, [draft, isSending, draftBytes, bodyBudgetBytes, sellerPubky, buyerPubky, listingId, loadMessages]);

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
