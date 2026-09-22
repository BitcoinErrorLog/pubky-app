/**
 * Wave A consumer copy. One plain sentence per state. Do not add Paykit,
 * bytes, truncated pubkys, or experiment-grade language on shop screens.
 *
 * Listing disclosure uses the Round 2 implementer wording: the buyer follows
 * the seller, so the seller sees the thread after that follow (or an order).
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
  listingDisclosure: 'You can write here. The seller sees it after you follow them or you share an order.',
  listingEmptyThread: 'Ask about condition, shipping, or item details. Do not share payment credentials.',
  notEnrolledSeller: 'This seller has not turned on private messages yet. Nothing can be delivered until they do.',
  notEnrolledBuyer: 'This buyer has not turned on private messages yet.',
  handshakeInitiator: 'Waiting for them to open Messages. Your notes stay on this device until then.',
  handshakeResponder: 'Still opening this conversation. Your notes stay on this device until it is ready.',
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
} as const;

export function marketplaceCounterpartyLabel(input: {
  profileName?: string | null;
  counterpartyIsSeller: boolean;
}): string {
  const name = input.profileName?.trim();
  if (name) return name;
  return input.counterpartyIsSeller ? MESSAGING_COPY.thisSeller : MESSAGING_COPY.thisBuyer;
}
