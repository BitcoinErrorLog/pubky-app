import type { ConversationOrigin } from './first-contact';

/**
 * One authenticated inbound message, as the link runtime hands it to the
 * Shop before storing it. `counterpartyPubky` is the authenticated link peer;
 * `conversationId` has already passed the binding check against both
 * endpoints.
 */
export type MessagingIntakeCandidate = {
  counterpartyPubky: string;
  kind: 'listing' | 'dm';
  conversationId: string;
};

export type MessagingIntakeDecision =
  | { store: false; reason: 'muted' | 'rate_limited' }
  /** `origin` applies only when this message creates its conversation row. */
  | { store: true; origin: ConversationOrigin };

/**
 * The seam between the link runtime (which authenticates peers, decrypts and
 * persists) and Shop policy (mutes, rate caps, Requests). The runtime asks
 * once per message, after routing and before persistence, and never stores a
 * message the gate refuses. A refused message is still consumed: the runtime
 * advances its read position past it exactly as for a stored one.
 */
export interface MessagingIntakeGate {
  admit(candidate: MessagingIntakeCandidate): Promise<MessagingIntakeDecision>;
}
