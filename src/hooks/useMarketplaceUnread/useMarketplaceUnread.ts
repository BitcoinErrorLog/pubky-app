'use client';

import { useEffect, useState } from 'react';
import { getCommerceAdapterMode, getCommercePollIntervalMs, isDurableCommerceMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { Logger } from '@/libs/logger/logger';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import { useMessagingStore } from '@/stores/messaging/messaging.store';

/**
 * Unread count for the MARKETPLACE nav entry: marketplace (listing)
 * conversations with unread received messages — device-local, same honesty
 * contract as the Messages badge — PLUS unread marketplace notifications from
 * the transaction service (offers, bids, orders, disputes), which are
 * operationally time-sensitive.
 *
 * The notification slice needs the durable service and a live marketplace
 * session; without either it contributes 0 instead of guessing. Notification
 * polling runs at the commerce interval from the single nav mount.
 */
export function useMarketplaceUnread(): number {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const marketplaceSession = useCommerceStore((state) => state.marketplaceSession);
  const unreadMarketplaceConversations = useMessagingStore((state) => state.unreadMarketplaceConversations);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (!currentUserPubky || !isDurableCommerceMode(getCommerceAdapterMode()) || !marketplaceSession) {
      setUnreadNotifications(0);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      if (cancelled || document.hidden) return;
      try {
        const notifications = await CommerceController.getMarketplaceNotifications();
        if (!cancelled) setUnreadNotifications(notifications.filter(({ readAt }) => !readAt).length);
      } catch (error) {
        // A failed read keeps the previous honest count instead of zeroing a
        // badge the user may be acting on.
        Logger.warn('Marketplace unread badge could not refresh notifications', { error });
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), getCommercePollIntervalMs());
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentUserPubky, marketplaceSession]);

  return unreadMarketplaceConversations + unreadNotifications;
}
