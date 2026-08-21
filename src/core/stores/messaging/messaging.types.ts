export interface MessagingState {
  /**
   * Pubky whose encrypted-messaging session is live in this tab, or null.
   * Public fact only — the session handle itself stays inside the service and
   * is never mirrored here. Surfaces subscribe to refetch when it changes.
   */
  enabledPubky: string | null;
}

export interface MessagingActions {
  setMessagingEnabled: (pubky: string) => void;
  clearMessagingEnabled: () => void;
}

export type MessagingStore = MessagingState & MessagingActions;

export const messagingInitialState: MessagingState = {
  enabledPubky: null,
};

export enum MessagingActionTypes {
  SET_ENABLED = 'messaging/setEnabled',
  CLEAR_ENABLED = 'messaging/clearEnabled',
}
