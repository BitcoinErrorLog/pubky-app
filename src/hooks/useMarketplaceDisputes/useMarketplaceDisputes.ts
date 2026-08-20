'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { getCommerceAdapterMode, isDurableCommerceMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { MarketplaceOrder } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';

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
  const adapterMode = getCommerceAdapterMode();
  const isDurable = isDurableCommerceMode(adapterMode);
  const [disputes, setDisputes] = useState<MarketplaceOrder[]>([]);
  const [isModerator, setIsModerator] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(isDurable && Boolean(currentUserPubky));
  const [error, setError] = useState<string | null>(null);

  const refresh = () => loadDisputes(currentUserPubky, setDisputes, setIsModerator, setIsLoading, setError);

  useEffect(() => {
    if (!currentUserPubky || !isDurable) {
      setIsLoading(false);
      return;
    }
    void loadDisputes(currentUserPubky, setDisputes, setIsModerator, setIsLoading, setError);
  }, [currentUserPubky, isDurable]);

  return { disputes, isModerator, isLoading, error, adapterMode, refresh };
}

async function loadDisputes(
  currentUserPubky: string | null,
  setDisputes: Dispatch<SetStateAction<MarketplaceOrder[]>>,
  setIsModerator: Dispatch<SetStateAction<boolean | null>>,
  setIsLoading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | null>>,
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
  } catch (loadError) {
    // A missing/expired marketplace session carries actionable guidance
    // (approve the connection on your signer) — surface it as-is.
    setError(
      loadError instanceof Error && loadError.name === 'AppError'
        ? loadError.message
        : 'The dispute queue is unavailable.',
    );
  } finally {
    setIsLoading(false);
  }
}
