'use client';

import { useEffect, useState } from 'react';
import { getCommercePollIntervalMs } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { MarketplaceConversation } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';

export function useMarketplaceInbox() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [conversations, setConversations] = useState<MarketplaceConversation[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(currentUserPubky));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUserPubky) {
      setIsLoading(false);
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const next = await CommerceController.getMarketplaceConversations();
        if (active) {
          setConversations(next);
          setError(null);
        }
      } catch {
        if (active) setError('Marketplace messages are unavailable.');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, getCommercePollIntervalMs());
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [currentUserPubky]);

  return { conversations, isLoading, error };
}
