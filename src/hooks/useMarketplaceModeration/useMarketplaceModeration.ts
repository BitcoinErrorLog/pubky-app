'use client';

import { useEffect, useState } from 'react';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { MarketplaceReport } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';

export function useMarketplaceModeration() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [reports, setReports] = useState<MarketplaceReport[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(currentUserPubky));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUserPubky) {
      setIsLoading(false);
      return;
    }
    CommerceController.getMarketplaceReports()
      .then(setReports)
      .catch(() => setError('This account does not have marketplace moderator access.'))
      .finally(() => setIsLoading(false));
  }, [currentUserPubky]);

  return { reports, isLoading, error };
}
