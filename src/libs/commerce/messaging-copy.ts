/**
 * Messaging consumer copy. One plain sentence per state. Do not add Paykit,
 * bytes, truncated pubkys, or experiment-grade language on shop screens.
 *
 * The listing disclosure explains how the seller finds a new buyer: the
 * buyer's first message follows the seller (`followOnSend`), and the seller
 * sees the thread after that follow or an order.
 */
export const MESSAGING_COPY = {
  inboxSubtitleDurable: 'Private listing conversations. History stays on this device.',
  inboxSignedOutTitle: 'Sign in to see your messages.',
  inboxSignedOutBody: 'Messages belong to the account signed in on this device.',
  inboxNeedsEnable: 'Approve in your Pubky signer so this device can send and receive private messages.',
  inboxNeedsReconnect: 'This device needs a new approval to send and receive. Your saved messages stay here.',
  inboxEmptyTitle: 'No messages yet.',
  inboxEmptyBody: 'Open a listing and message its seller to begin.',
  inboxRetry: 'Try again',
  listingCta: 'Message seller',
  listingOwn: 'This is your listing. Buyer conversations appear in your messages.',
  listingEmptyThread: 'Ask about condition, shipping, or item details. Do not share payment credentials.',
  notEnrolledSeller: 'This seller has not turned on private messages yet. Nothing can be delivered until they do.',
  notEnrolledBuyer: 'This buyer has not turned on private messages yet.',
  handshakeInitiator: 'Waiting for them to open Messages. Your notes stay on this device until then.',
  handshakeResponder: 'Still opening this conversation. Your notes stay on this device until it is ready.',
  linkRecoveryNeeded:
    'This private conversation cannot finish connecting on this device. Nothing was deleted. Your notes stay on this device and are sent only if the connection recovers.',
  counterpartyUnreachable:
    "We could not reach this person's messaging setup right now. We will keep trying. Your notes stay on this device until then.",
  inboxSyncFailed: 'Your messages could not be loaded right now. Check your connection and try again.',
  queued: 'Queued',
  composerOverLimit: 'Shorten this message to send it.',
  noAttachments: 'Images are not available in private messages yet.',
  orderCta: 'Message about this order',
  assumedDelivery: "Marked delivered automatically after the delivery window; tell the seller if it hasn't arrived.",
  enable: 'Approve in your Pubky signer so this device can send and receive private messages.',
  reconnect: 'This device needs a new approval to send and receive. Your saved messages stay here.',
  enableSuccess: 'Private messages are on for this device.',
  reconnectSuccess: 'Private messages are connected again on this device.',
  sandboxWarning:
    "Sandbox messages are not encrypted: they are stored in plaintext in the sandbox service's memory and are readable by whoever runs it. Do not share anything private.",
  unavailable: 'Messaging is not available here.',
  deepLinkInvalid: 'That conversation link is not valid.',
  deepLinkOtherAccount: 'This conversation is not on this account.',
  thisSeller: 'This seller',
  thisBuyer: 'This buyer',
  followOnSend: 'Sending also follows this shop so they can see your message.',
  followFailed: 'We could not follow this shop for you. The seller sees your message after you follow them.',
  firstContactLimited: 'You have messaged 5 new people in the last hour. Try again later.',
  requestsTitle: 'Requests',
  requestsBody: 'Messages from people you have not talked to yet. They do not count as unread.',
  requestPreview: 'Asked about this listing.',
  requestAccept: 'Accept',
  requestAccepted: 'Moved to your messages.',
  mute: 'Mute',
  unmute: 'Unmute',
  muted: 'Muted. You will not see new messages from this person.',
  unmuted: 'Unmuted. New messages from this person will reach you again.',
  mutedThread: 'You muted this person. Unmute them to see new messages or reply.',
  mutedSendRefused: 'You muted this person. Unmute them to send a message.',
  muteFailed: 'The mute could not be saved. Try again.',
  muteListFull: 'You can mute up to 1,000 people. Unmute someone to mute another person.',
  muteNeedsApproval: 'Approve private sync to save mutes.',
  approvePrivateSync: 'Approve private sync',
  mutesNeedApproval: 'New messages are paused until you approve private sync, so mutes keep working.',
  sendPausedForMutes: 'Sending is paused until your mutes can be loaded. Try again in a moment.',
  mutesUnavailable: 'New messages are paused because your mutes could not be loaded. Try again.',
  rateCap: 'Too many messages from this person. Try again later.',
  report: 'Report',
  reportCopied: 'Report details copied. Paste them only where you intend to send them.',
  reportFailed: 'Report details could not be copied.',
  conversationActions: 'Conversation options',
} as const;

/**
 * What "Report" copies: the conversation and the other account, so the user
 * can paste it wherever they choose to report. It is never put in a URL.
 */
export function messagingReportText(input: { conversationId: string; counterpartyPubky: string }): string {
  return `Pubky Shop message report\nConversation: ${input.conversationId}\nAccount: ${input.counterpartyPubky}`;
}

export function marketplaceCounterpartyLabel(input: {
  profileName?: string | null;
  counterpartyIsSeller: boolean;
}): string {
  const name = input.profileName?.trim();
  if (name) return name;
  return input.counterpartyIsSeller ? MESSAGING_COPY.thisSeller : MESSAGING_COPY.thisBuyer;
}
