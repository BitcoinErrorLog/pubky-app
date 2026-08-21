import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { MessagingActionTypes, messagingInitialState, type MessagingStore } from './messaging.types';

export const useMessagingStore = create<MessagingStore>()(
  devtools(
    (set) => ({
      ...messagingInitialState,
      setMessagingEnabled: (pubky) => set({ enabledPubky: pubky }, false, MessagingActionTypes.SET_ENABLED),
      clearMessagingEnabled: () => set({ enabledPubky: null }, false, MessagingActionTypes.CLEAR_ENABLED),
    }),
    { name: 'messaging-store' },
  ),
);
