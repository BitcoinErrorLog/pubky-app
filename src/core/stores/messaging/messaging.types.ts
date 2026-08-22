export interface MessagingState {
  /**
   * Pubky whose encrypted-messaging session is live in this tab, or null.
   * Public fact only — the session handle itself stays inside the service and
   * is never mirrored here. Surfaces subscribe to refetch when it changes.
   */
  enabledPubky: string | null;
  /**
   * Device-local unread conversation count: conversations holding at least
   * one RECEIVED message persisted after their read checkpoint. Honest by
   * construction — it counts only messages already stored on this device,
   * never undelivered mail on a homeserver. Refreshed by the controller after
   * sync/receive/mark-read.
   */
  unreadConversations: number;
  /**
   * The `kind: 'listing'` (marketplace) slice of {@link unreadConversations}.
   * Marketplace conversations are operationally time-sensitive, so the
   * marketplace nav entry carries its own badge; the Messages entry badges
   * only the general-DM remainder. Same honesty contract as the total.
   */
  unreadMarketplaceConversations: number;
}

export interface MessagingActions {
  setMessagingEnabled: (pubky: string) => void;
  clearMessagingEnabled: () => void;
  setUnreadConversations: (total: number, marketplace: number) => void;
}

export type MessagingStore = MessagingState & MessagingActions;

export const messagingInitialState: MessagingState = {
  enabledPubky: null,
  unreadConversations: 0,
  unreadMarketplaceConversations: 0,
};

export enum MessagingActionTypes {
  SET_ENABLED = 'messaging/setEnabled',
  CLEAR_ENABLED = 'messaging/clearEnabled',
  SET_UNREAD = 'messaging/setUnreadConversations',
}
