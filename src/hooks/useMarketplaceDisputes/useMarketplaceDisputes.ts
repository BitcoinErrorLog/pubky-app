'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { getCommerceAdapterMode, isDurableCommerceMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { isMarketplaceSessionRequiredError } from '@/libs/error/error.utils';
import type { MarketplaceOrder } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCommerceStore } from '@/stores/commerce/commerce.store';

/**
 * The moderator dispute adjudication queue (`GET /v1/disputes`) — durable
 * transaction service only; the sandbox has no dispute queue at all, so
 * nothing is fetched outside `transaction-service` mode and the surface must
 * say so instead of pretending.
 *
 * Moderator status is the service's answer, not client configuration:
 * a 200 means the session's pubky is a configured moderator; a 403 (surfaced
 * here as `isModerator === false`) means it is not, and the queue must stay
 * ABSENT — the service deliberately refuses non-moderators rather than
 * handing them an empty list, and rendering an empty-looking queue would
 * fake an affordance the account does not have.
 */
export function useMarketplaceDisputes() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  // Refetch trigger: connecting a session replaces this store object, so the
  // effect below re-runs immediately.
  const marketplaceSession = useCommerceStore((state) => state.marketplaceSession);
  const adapterMode = getCommerceAdapterMode();
  const isDurable = isDurableCommerceMode(adapterMode);
  const [disputes, setDisputes] = useState<MarketplaceOrder[]>([]);
  const [isModerator, setIsModerator] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(isDurable && Boolean(currentUserPubky));
  const [error, setError] = useState<string | null>(null);
  const [needsSession, setNeedsSession] = useState(false);

  const refresh = () =>
    loadDisputes(currentUserPubky, setDisputes, setIsModerator, setIsLoading, setError, setNeedsSession);

  useEffect(() => {
    if (!currentUserPubky || !isDurable) {
      setIsLoading(false);
      return;
    }
    void loadDisputes(currentUserPubky, setDisputes, setIsModerator, setIsLoading, setError, setNeedsSession);
  }, [currentUserPubky, isDurable, marketplaceSession]);

  return { disputes, isModerator, isLoading, error, needsSession, adapterMode, refresh };
}

async function loadDisputes(
  currentUserPubky: string | null,
  setDisputes: Dispatch<SetStateAction<MarketplaceOrder[]>>,
  setIsModerator: Dispatch<SetStateAction<boolean | null>>,
  setIsLoading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | null>>,
  setNeedsSession: Dispatch<SetStateAction<boolean>>,
): Promise<void> {
  if (!currentUserPubky || !isDurableCommerceMode(getCommerceAdapterMode())) return;
  try {
    const queue = await CommerceController.getMarketplaceDisputes();
    if (queue === null) {
      // The service refused the read (403): not a configured moderator.
      setIsModerator(false);
      setDisputes([]);
    } else {
      setIsModerator(true);
      setDisputes(queue);
    }
    setError(null);
    setNeedsSession(false);
  } catch (loadError) {
    // A missing/expired marketplace session is not a dead end: flag it so the
    // surface renders the session-connect affordance with the real guidance.
    setNeedsSession(isMarketplaceSessionRequiredError(loadError));
    setError(
      loadError instanceof Error && loadError.name === 'AppError'
        ? loadError.message
        : 'The dispute queue is unavailable.',
    );
  } finally {
    setIsLoading(false);
  }
}
