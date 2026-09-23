'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getLocksUrl } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpStatusCode } from '@/libs/http/http.types';
import { LocksGatewayService } from '@/services/locks/locks';
import { locksCreatorMatchesShopPubky, normalizeLocksPubky } from '@/services/locks/locks-frontend-session';
import { useAuthStore } from '@/stores/auth/auth.store';

/**
 * The pending connect `state` nonce. localStorage still covers the hosted
 * redirect fallback (`?code&state` on this page). The iframe postmessage path
 * also keeps the nonce in a ref so the same-tab callback cannot be confused
 * with a previous attempt. The value is a random nonce, never bearer material.
 */
const LOCKS_CONNECT_STATE_STORAGE_KEY = 'marketplace:locks-connect-state';

/** Postmessage `type` the Lock Server embed shell publishes on completion. */
export const LOCKS_CONNECT_CALLBACK_TYPE = 'locks-auth-callback';

/** One-sentence, no developer text — shown for every failed Step 1 attempt. */
export const LOCKS_CONNECT_USER_ERROR = 'This Lock Server connection did not finish. Approve it again from this page.';

/** Shown when the Lock Server names a creator that is not the signed-in Shop account. */
export const LOCKS_CONNECT_IDENTITY_ERROR =
  "This Bitcoin connection belongs to a different account. Connect with the account you're signed in with.";

const LOCKS_CONNECT_TIMEOUT_MS = 6 * 60 * 1_000;

function rejectMismatchedCreator(): void {
  CommerceController.clearLocksFrontendSession();
  window.localStorage.removeItem(LOCKS_CONNECT_STATE_STORAGE_KEY);
}

function locksOrigin(): string {
  return new URL(getLocksUrl()).origin;
}

function isLocksAuthCallback(data: unknown): data is { type: string; state?: string; code?: string; error?: string } {
  return typeof data === 'object' && data !== null && 'type' in data;
}

function isRejectedLocksSession(error: unknown): boolean {
  return (
    hasHttpStatus(error, HttpStatusCode.UNAUTHORIZED) ||
    hasHttpStatus(error, HttpStatusCode.FORBIDDEN) ||
    hasHttpStatus(error, HttpStatusCode.NOT_FOUND)
  );
}

/**
 * Seller-side Lock Server connection: embeds the hosted legacy-connect flow with
 * `delivery=postmessage` so the Lock Server poller starts immediately (the
 * relay lease is held while Ring approves) and completion lands in this tab.
 * `connectedCreator` is a REAL completion signal — the Lock Server proved it
 * holds creator authority — never an optimistic assumption. The frontend
 * session token is persisted under `pubky.marketplace.locks-frontend-session.v1`
 * and wiped on sign-out with the marketplace session.
 */
export function useMarketplaceLocksConnect() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [connectedCreator, setConnectedCreator] = useState<string | null>(null);
  const [isExchanging, setIsExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const connectIframeRef = useRef<HTMLIFrameElement>(null);
  const pendingStateRef = useRef<string | null>(null);
  const restoreGenerationRef = useRef(0);
  const setConnectIframe = useCallback((element: HTMLIFrameElement | null) => {
    connectIframeRef.current = element;
  }, []);

  const closeConnect = useCallback(() => {
    pendingStateRef.current = null;
    window.localStorage.removeItem(LOCKS_CONNECT_STATE_STORAGE_KEY);
    setConnectOpen(false);
    setConnectUrl(null);
    setIsExchanging(false);
  }, []);

  const applySession = useCallback((creator: string) => {
    window.localStorage.removeItem(LOCKS_CONNECT_STATE_STORAGE_KEY);
    pendingStateRef.current = null;
    setConnectedCreator(normalizeLocksPubky(creator));
    setError(null);
    setConnectOpen(false);
    setConnectUrl(null);
  }, []);

  const exchangeCompletion = useCallback(
    async (code: string, state: string) => {
      setIsExchanging(true);
      setError(null);
      try {
        const session = await CommerceController.createLocksFrontendSession(code, state, currentUserPubky ?? undefined);
        if (!locksCreatorMatchesShopPubky(session.creator, currentUserPubky)) {
          rejectMismatchedCreator();
          pendingStateRef.current = null;
          setConnectedCreator(null);
          setError(LOCKS_CONNECT_IDENTITY_ERROR);
          setConnectOpen(false);
          setConnectUrl(null);
          return;
        }
        applySession(session.creator);
      } catch {
        setError(LOCKS_CONNECT_USER_ERROR);
      } finally {
        setIsExchanging(false);
      }
    },
    [applySession, currentUserPubky],
  );

  const openConnect = useCallback(() => {
    const state = crypto.randomUUID().replaceAll('-', '');
    pendingStateRef.current = state;
    window.localStorage.setItem(LOCKS_CONNECT_STATE_STORAGE_KEY, state);
    const url = LocksGatewayService.buildLegacyConnectUrl(
      `${window.location.origin}${window.location.pathname}`,
      state,
    );
    setError(null);
    setConnectUrl(url);
    setConnectOpen(true);
  }, []);

  useEffect(() => {
    restoreGenerationRef.current += 1;
    const generation = restoreGenerationRef.current;
    if (!currentUserPubky) {
      setConnectedCreator(null);
      return;
    }
    const stored = CommerceController.restoreLocksFrontendSession(currentUserPubky);
    if (!stored || !locksCreatorMatchesShopPubky(stored.creator, currentUserPubky)) {
      if (stored) {
        rejectMismatchedCreator();
        setError(LOCKS_CONNECT_IDENTITY_ERROR);
      }
      setConnectedCreator(null);
      return;
    }
    let active = true;
    void CommerceController.getLocksCreatorAuthorityStatus(stored.token)
      .then((status) => {
        if (!active || generation !== restoreGenerationRef.current) return;
        const creator = status.creator || stored.creator;
        if (status.authorized && locksCreatorMatchesShopPubky(creator, currentUserPubky)) {
          setConnectedCreator(normalizeLocksPubky(creator));
          return;
        }
        if (status.authorized) {
          rejectMismatchedCreator();
          setError(LOCKS_CONNECT_IDENTITY_ERROR);
        } else {
          CommerceController.clearLocksFrontendSession();
        }
        setConnectedCreator(null);
      })
      .catch((error) => {
        if (!active || generation !== restoreGenerationRef.current) return;
        if (!isRejectedLocksSession(error)) return;
        CommerceController.clearLocksFrontendSession();
        setConnectedCreator(null);
      });
    return () => {
      active = false;
    };
  }, [currentUserPubky]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return;
    const pending = pendingStateRef.current ?? window.localStorage.getItem(LOCKS_CONNECT_STATE_STORAGE_KEY);
    if (pending !== state) {
      setError(LOCKS_CONNECT_USER_ERROR);
      return;
    }
    let active = true;
    void exchangeCompletion(code, state).then(() => {
      if (!active) return;
      window.history.replaceState(null, '', window.location.pathname);
    });
    return () => {
      active = false;
    };
  }, [exchangeCompletion]);

  useEffect(() => {
    if (!connectOpen || !connectUrl) return;
    const expectedOrigin = locksOrigin();
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== expectedOrigin ||
        !connectIframeRef.current ||
        event.source !== connectIframeRef.current.contentWindow
      ) {
        return;
      }
      if (!isLocksAuthCallback(event.data) || event.data.type !== LOCKS_CONNECT_CALLBACK_TYPE) return;
      if (event.data.error || typeof event.data.code !== 'string' || typeof event.data.state !== 'string') {
        setError(LOCKS_CONNECT_USER_ERROR);
        return;
      }
      const pending = pendingStateRef.current ?? window.localStorage.getItem(LOCKS_CONNECT_STATE_STORAGE_KEY);
      if (pending !== event.data.state) {
        setError(LOCKS_CONNECT_USER_ERROR);
        return;
      }
      void exchangeCompletion(event.data.code, event.data.state);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [connectOpen, connectUrl, exchangeCompletion]);

  useEffect(() => {
    if (!connectOpen || !connectUrl || isExchanging) return;
    const timeout = window.setTimeout(() => setError(LOCKS_CONNECT_USER_ERROR), LOCKS_CONNECT_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [connectOpen, connectUrl, isExchanging]);

  return {
    openConnect,
    closeConnect,
    connectedCreator,
    isExchanging,
    error,
    connectOpen,
    connectUrl,
    setConnectIframe,
  };
}
