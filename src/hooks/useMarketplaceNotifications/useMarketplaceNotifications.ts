'use client';

import { useEffect, useState } from 'react';
import { getCommerceAdapterMode, getCommercePollIntervalMs } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { toast } from '@/molecules/Toaster/use-toast';
import type { MarketplaceNotification, MarketplaceNotificationPreferences } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';

/**
 * Commerce notifications from whichever transactional backend the mode
 * selects. Read state and preferences are SANDBOX-ONLY and stay that way
 * honestly: the durable service delivers notifications as immutable outbox
 * rows with no `revision`, no `notification.mark_read` command, and no
 * preference tables at all — so in `transaction-service` mode this hook
 * never fetches preferences and refuses to mark anything read, and the UI
 * must not pretend otherwise.
 */
export function useMarketplaceNotifications() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const adapterMode = getCommerceAdapterMode();
  const canMarkRead = adapterMode === 'sandbox';
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
          canMarkRead ? CommerceController.getMarketplaceNotificationPreferences() : Promise.resolve(null),
        ]);
        if (active) {
          setNotifications(next);
          setPreferences(nextPreferences);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error && loadError.name === 'AppError'
              ? loadError.message
              : 'Commerce notifications are unavailable.',
          );
        }
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
  }, [canMarkRead, currentUserPubky]);

  const markAllRead = async () => {
    // Re-checked at call time: `notification.mark_read` does not exist on the
    // durable service (delivered notifications are immutable outbox rows).
    if (getCommerceAdapterMode() !== 'sandbox') {
      toast({ variant: 'error', description: 'The durable marketplace service does not store read state yet.' });
      return;
    }
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
            : {
                ...notification,
                ...(notification.revision === undefined ? {} : { revision: notification.revision + 1 }),
                readAt: new Date().toISOString(),
              },
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
    // Re-checked at call time: `notification.preferences.update` has no
    // durable counterpart — preference tables do not exist on the service.
    if (getCommerceAdapterMode() !== 'sandbox') {
      toast({
        variant: 'error',
        description: 'The durable marketplace service does not store notification preferences yet.',
      });
      return false;
    }
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
    canMarkRead,
    markAllRead,
    updatePreferences,
  };
}
