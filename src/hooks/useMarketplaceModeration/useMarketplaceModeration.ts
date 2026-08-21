'use client';

import { useEffect, useState } from 'react';
import { CommerceController } from '@/controllers/commerce/commerce';
import { isMarketplaceSessionRequiredError } from '@/libs/error/error.utils';
import type { MarketplaceReport } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCommerceStore } from '@/stores/commerce/commerce.store';

export function useMarketplaceModeration() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  // Refetch trigger: connecting a session replaces this store object, so the
  // effect below re-runs immediately.
  const marketplaceSession = useCommerceStore((state) => state.marketplaceSession);
  const [reports, setReports] = useState<MarketplaceReport[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(currentUserPubky));
  const [error, setError] = useState<string | null>(null);
  const [needsSession, setNeedsSession] = useState(false);

  useEffect(() => {
    if (!currentUserPubky) {
      setIsLoading(false);
      return;
    }
    let active = true;
    setIsLoading(true);
    CommerceController.getMarketplaceReports()
      .then((next) => {
        if (!active) return;
        setReports(next);
        setError(null);
        setNeedsSession(false);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        // A missing/expired durable session is not an access refusal — it has
        // its own remedy (the session-connect affordance), so it must not be
        // mislabeled as missing moderator access.
        if (isMarketplaceSessionRequiredError(loadError)) {
          setNeedsSession(true);
          setError(loadError.message);
          return;
        }
        setNeedsSession(false);
        setError('This account does not have marketplace moderator access.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentUserPubky, marketplaceSession]);

  return { reports, isLoading, error, needsSession };
}
