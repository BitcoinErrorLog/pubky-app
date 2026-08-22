import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { MessagingActionTypes, messagingInitialState, type MessagingStore } from './messaging.types';

export const useMessagingStore = create<MessagingStore>()(
  devtools(
    (set) => ({
      ...messagingInitialState,
      setMessagingEnabled: (pubky) => set({ enabledPubky: pubky }, false, MessagingActionTypes.SET_ENABLED),
      clearMessagingEnabled: () =>
        set({ enabledPubky: null, unreadConversations: 0 }, false, MessagingActionTypes.CLEAR_ENABLED),
      setUnreadConversations: (total, marketplace) =>
        set(
          { unreadConversations: total, unreadMarketplaceConversations: marketplace },
          false,
          MessagingActionTypes.SET_UNREAD,
        ),
    }),
    { name: 'messaging-store' },
  ),
);
