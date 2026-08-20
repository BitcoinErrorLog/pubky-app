'use client';

import { useEffect, useState } from 'react';
import { getCommercePollIntervalMs } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { MarketplaceNotification } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';

export function useMarketplaceNotifications() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [notifications, setNotifications] = useState<MarketplaceNotification[]>([]);
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
        const next = await CommerceController.getMarketplaceNotifications();
        if (active) {
          setNotifications(next);
          setError(null);
        }
      } catch {
        if (active) setError('Commerce notifications are unavailable.');
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

  return { notifications, unreadCount: notifications.filter(({ readAt }) => !readAt).length, isLoading, error };
}
