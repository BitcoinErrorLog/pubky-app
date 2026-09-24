'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getCommerceAdapterMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { isMarketplaceActionActivity } from '@/libs/commerce/marketplace-attention';
import { Logger } from '@/libs/logger/logger';
import { isRecognizedMarketplaceNotification } from '@/services/marketplace/marketplace-projections';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCommerceStore } from '@/stores/commerce/commerce.store';

/**
 * Device-local unread count for the marketplace Activity entry point.
 *
 * HONESTY CONTRACT (same doctrine as the Messages badge): the durable
 * service stores NO notification read state, so this badge never claims
 * "unread" on the service's behalf. It counts, without overlap:
 *
 * - service notifications that still need the user (a return, an offer, a
 *   message, a pickup, a refund, a bitcoin decision). Informational rows
 *   stay in the history and do not count. Sandbox rows use their REAL read
 *   state (`readAt`, clearable via `notification.mark_read`); durable rows
 *   use a device-local read checkpoint — only rows created after the last
 *   time THIS device opened an activity surface, cleared by visiting one.
 * - unseen watch alerts — rows this device's own checks produced, whose
 *   `seen_at` read state is real because it is local.
 *
 * The local parts (alerts, checkpoint) are live Dexie reads; the service
 * list is fetched on mount and re-fetched when the session or checkpoint
 * changes. A failed fetch contributes zero — the badge may lag reality but
 * can never invent it. Zero renders no badge.
 *
 * Every asynchronous result is tagged with the pubky it was read for. A
 * result for any other pubky is dropped, and an identity change clears the
 * displayed counts before paint so the previous account cannot badge the
 * next one.
 */
type TaggedCount = { pubky: string; count: number };

type LocalActivityBadge = {
  pubky: string | null;
  unseenAlertCount: number;
  checkpoint: number | undefined;
};

export function useMarketplaceActivityUnread(): number {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  // Refetch trigger: connecting a session replaces this store object (the
  // same wiring the activity page's own notifications hook relies on).
  const marketplaceSession = useCommerceStore((state) => state.marketplaceSession);
  const adapterMode = getCommerceAdapterMode();
  const [trackedPubky, setTrackedPubky] = useState(currentUserPubky);
  const [notificationCount, setNotificationCount] = useState<TaggedCount | null>(null);
  const pubkyRef = useRef(currentUserPubky);
  useLayoutEffect(() => {
    pubkyRef.current = currentUserPubky;
  }, [currentUserPubky]);

  // Identity changes before paint. React re-renders with a cleared count
  // instead of committing the previous account's badge.
  if (trackedPubky !== currentUserPubky) {
    setTrackedPubky(currentUserPubky);
    setNotificationCount(null);
  }

  const local = useLiveQuery(async (): Promise<LocalActivityBadge> => {
    if (!currentUserPubky) return { pubky: null, unseenAlertCount: 0, checkpoint: 0 };
    try {
      const [alerts, checkpoint] = await Promise.all([
        CommerceController.getWatchAlerts(),
        CommerceController.getActivityReadCheckpoint(),
      ]);
      return {
        pubky: currentUserPubky,
        unseenAlertCount: alerts.filter(({ seen_at }) => seen_at === null).length,
        checkpoint,
      };
    } catch (error) {
      // A stubbed controller throws before a promise exists. Leaving the
      // checkpoint unset keeps the service count at zero instead of treating
      // every row as new.
      Logger.warn('Failed to load the marketplace activity badge count', { error });
      return { pubky: currentUserPubky, unseenAlertCount: 0, checkpoint: undefined };
    }
  }, [currentUserPubky]);

  const localForCurrent = currentUserPubky !== null && local?.pubky === currentUserPubky ? local : undefined;
  const checkpoint = localForCurrent?.checkpoint;
  const serviceCount = notificationCount?.pubky === currentUserPubky ? notificationCount.count : 0;

  useEffect(() => {
    if (!currentUserPubky || adapterMode === 'unavailable' || checkpoint === undefined) {
      setNotificationCount(currentUserPubky ? { pubky: currentUserPubky, count: 0 } : null);
      return;
    }
    const fetchedFor = currentUserPubky;
    const fetchedCheckpoint = checkpoint;
    let active = true;
    // A stubbed controller throws before a promise exists. That is a failed
    // load: the badge stays at zero.
    Promise.resolve()
      .then(() => CommerceController.getMarketplaceNotifications())
      .then((notifications) => {
        if (!active || pubkyRef.current !== fetchedFor) return;
        setNotificationCount({
          pubky: fetchedFor,
          count: notifications.filter((notification) => {
            if (!isRecognizedMarketplaceNotification(notification)) return false;
            if (!isMarketplaceActionActivity(notification.type)) return false;
            if (adapterMode === 'sandbox') return !notification.readAt;
            return new Date(notification.createdAt).getTime() > fetchedCheckpoint;
          }).length,
        });
      })
      .catch((error) => {
        if (!active || pubkyRef.current !== fetchedFor) return;
        setNotificationCount({ pubky: fetchedFor, count: 0 });
        Logger.warn('Failed to load the marketplace activity badge count', { error });
      });
    return () => {
      active = false;
    };
  }, [currentUserPubky, adapterMode, checkpoint, marketplaceSession]);

  return serviceCount + (localForCurrent?.unseenAlertCount ?? 0);
}
