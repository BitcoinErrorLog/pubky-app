'use client';

import { useEffect, useState } from 'react';
import { getCommercePollIntervalMs } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { toast } from '@/molecules/Toaster/use-toast';
import type { MarketplaceNotification, MarketplaceNotificationPreferences } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';

export function useMarketplaceNotifications() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [notifications, setNotifications] = useState<MarketplaceNotification[]>([]);
  const [preferences, setPreferences] = useState<MarketplaceNotificationPreferences | null>(null);
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
        const [next, nextPreferences] = await Promise.all([
          CommerceController.getMarketplaceNotifications(),
          CommerceController.getMarketplaceNotificationPreferences(),
        ]);
        if (active) {
          setNotifications(next);
          setPreferences(nextPreferences);
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

  const markAllRead = async () => {
    const unread = notifications.filter(({ readAt }) => !readAt);
    try {
      const results = await Promise.all(
        unread.map((notification) =>
          CommerceController.executeMarketplaceCommand({
            version: 1,
            commandId: crypto.randomUUID(),
            aggregateId: `notification:${notification.id}`,
            expectedRevision: notification.revision,
            issuedAt: new Date().toISOString(),
            kind: 'notification.mark_read',
            payload: { notificationId: notification.id },
          }),
        ),
      );
      const failed = results.find((result) => !result.ok);
      if (failed && !failed.ok) {
        toast({ variant: 'error', description: failed.error.message });
        return;
      }
      setNotifications((current) =>
        current.map((notification) =>
          notification.readAt
            ? notification
            : { ...notification, revision: notification.revision + 1, readAt: new Date().toISOString() },
        ),
      );
    } catch {
      toast({ variant: 'error', description: 'Could not mark commerce notifications read.' });
    }
  };

  const updatePreferences = async (
    changes: Pick<MarketplaceNotificationPreferences, 'messages' | 'offers' | 'bids' | 'auctions'>,
  ) => {
    if (!currentUserPubky || !preferences) return false;
    try {
      const response = await CommerceController.executeMarketplaceCommand({
        version: 1,
        commandId: crypto.randomUUID(),
        aggregateId: `notification_preferences:${currentUserPubky}`,
        expectedRevision: preferences.revision,
        issuedAt: new Date().toISOString(),
        kind: 'notification.preferences.update',
        payload: changes,
      });
      if (!response.ok) {
        toast({ variant: 'error', description: response.error.message });
        return false;
      }
      setPreferences({
        ...preferences,
        ...changes,
        revision: preferences.revision + 1,
        updatedAt: new Date().toISOString(),
      });
      return true;
    } catch {
      toast({ variant: 'error', description: 'Could not update commerce notification preferences.' });
      return false;
    }
  };

  return {
    notifications,
    preferences,
    unreadCount: notifications.filter(({ readAt }) => !readAt).length,
    isLoading,
    error,
    markAllRead,
    updatePreferences,
  };
}
