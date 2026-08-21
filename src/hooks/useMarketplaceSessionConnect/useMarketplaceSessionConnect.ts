'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CommerceController } from '@/controllers/commerce/commerce';
import { getErrorMessage } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { copyToClipboard } from '@/libs/utils/utils';
import type {
  MarketplaceSessionConnectStatus,
  UseMarketplaceSessionConnectOptions,
  UseMarketplaceSessionConnectReturn,
} from './useMarketplaceSessionConnect.types';

type ActiveFlow = ReturnType<typeof CommerceController.beginMarketplaceSessionConnect>;

/**
 * Drives the interactive marketplace session-connect flow (durable modes
 * only): a fresh `pubkyauth://` URL for the user's signer, a pending
 * approval, cancellation, and retry. AuthToken flows are single-use, so
 * `start()` always begins a NEW flow — after an error or cancellation the
 * previous URL is dead and is never re-shown.
 *
 * Cancellation is detected by identity, not by error shape: `cancel()` and
 * `start()` first detach the current flow, so a rejection arriving from a
 * detached flow is dropped silently instead of being surfaced as a failure.
 */
export function useMarketplaceSessionConnect(
  options: UseMarketplaceSessionConnectOptions = {},
): UseMarketplaceSessionConnectReturn {
  const [status, setStatus] = useState<MarketplaceSessionConnectStatus>('idle');
  const [authorizationUrl, setAuthorizationUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOpeningRing, setIsOpeningRing] = useState(false);
  const activeFlowRef = useRef<ActiveFlow | null>(null);
  const onConnectedRef = useRef(options.onConnected);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);

  // Keep the latest callback without making `start` depend on its identity.
  useEffect(() => {
    onConnectedRef.current = options.onConnected;
  });

  const removeVisibilityHandler = useCallback(() => {
    if (visibilityHandlerRef.current) {
      document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
      visibilityHandlerRef.current = null;
    }
  }, []);

  const detachActiveFlow = useCallback(() => {
    const flow = activeFlowRef.current;
    activeFlowRef.current = null;
    if (flow) flow.cancel();
  }, []);

  const start = useCallback(() => {
    detachActiveFlow();
    removeVisibilityHandler();
    setIsOpeningRing(false);
    setErrorMessage(null);

    let flow: ActiveFlow;
    try {
      flow = CommerceController.beginMarketplaceSessionConnect();
    } catch (error) {
      Logger.error('Failed to start the marketplace session flow', { error });
      setAuthorizationUrl('');
      setErrorMessage(getErrorMessage(error));
      setStatus('error');
      return;
    }

    activeFlowRef.current = flow;
    setAuthorizationUrl(flow.authorizationUrl);
    setStatus('awaiting');

    flow
      .awaitSession()
      .then((session) => {
        if (activeFlowRef.current !== flow) return;
        activeFlowRef.current = null;
        setAuthorizationUrl('');
        setStatus('connected');
        onConnectedRef.current?.(session);
      })
      .catch((error: unknown) => {
        // A detached flow (cancelled or superseded) rejects as a side effect
        // of being freed — that is control flow, not a failure to report.
        if (activeFlowRef.current !== flow) return;
        activeFlowRef.current = null;
        Logger.error('Marketplace session flow failed', { error });
        setAuthorizationUrl('');
        setErrorMessage(getErrorMessage(error));
        setStatus('error');
      });
  }, [detachActiveFlow, removeVisibilityHandler]);

  const cancel = useCallback(() => {
    detachActiveFlow();
    removeVisibilityHandler();
    setIsOpeningRing(false);
    setAuthorizationUrl('');
    setErrorMessage(null);
    setStatus('idle');
  }, [detachActiveFlow, removeVisibilityHandler]);

  const copyAuthUrl = useCallback(async () => {
    if (!authorizationUrl) return;
    await copyToClipboard({ text: authorizationUrl });
  }, [authorizationUrl]);

  const openInRing = useCallback(() => {
    if (!authorizationUrl) return;
    removeVisibilityHandler();
    setIsOpeningRing(true);
    const onVisibilityChange = () => {
      if (document.hidden) {
        removeVisibilityHandler();
        setIsOpeningRing(false);
      }
    };
    visibilityHandlerRef.current = onVisibilityChange;
    document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
    window.location.href = authorizationUrl;
  }, [authorizationUrl, removeVisibilityHandler]);

  useEffect(() => {
    return () => {
      // Unmount cancels outright: unlike sign-in, nothing global consumes the
      // approval — without a mounted dialog the session would connect
      // invisibly, and the single-use flow is cheap to restart.
      detachActiveFlow();
      removeVisibilityHandler();
    };
  }, [detachActiveFlow, removeVisibilityHandler]);

  return { status, authorizationUrl, errorMessage, start, cancel, copyAuthUrl, openInRing, isOpeningRing };
}
