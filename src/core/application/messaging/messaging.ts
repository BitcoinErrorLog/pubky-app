import type { MarketplaceChatMessage } from '@/libs/commerce/messaging-contracts';
import { buildDmConversationId, type PubkyAppDmMessage } from '@/libs/messaging/dm-contracts';
import type {
  CommerceMessagingConversationModelSchema,
  CommerceMessagingMessageModelSchema,
} from '@/models/messaging/messaging.schema';
import { LocalMessagingService } from '@/services/local/messaging/messaging';
import {
  type MessagingEnableFlow,
  type MessagingLinkState,
  PaykitMessagingService,
  type ReceivedMessage,
} from '@/services/paykit/paykit-messaging';

export type MessagingStatus = {
  /**
   * A `/pub/paykit/:rw` homeserver session is live — resumed from the
   * sign-in cookie with zero approvals for current sign-ins, or from a Ring
   * approval for legacy sessions (restores across tabs/reloads).
   */
  sessionActive: boolean;
  /** A receiver Noise key exists on this device and its marker was published. */
  receiverProvisioned: boolean;
};

export type MessagingConversationSummary = CommerceMessagingConversationModelSchema & {
  lastMessage: CommerceMessagingMessageModelSchema | null;
};

/**
 * Application layer for end-to-end-encrypted messaging — marketplace listing
 * conversations AND general direct messages, over the same per-counterparty
 * Paykit Encrypted Links. Orchestrates the link service (network, crypto,
 * snapshot persistence) and the device-local history reads the UI renders
 * from. Message bodies never leave this layer toward logs, telemetry, or
 * projections. Deliberately independent of the commerce adapter mode —
 * marketplace-contextual surfaces gate themselves.
 */
export class MessagingApplication {
  private constructor() {}

  /**
   * Starts the interactive "enable encrypted messaging" flow: a Ring approval
   * for the `/pub/paykit/:rw` grant, then receiver provisioning and marker
   * publish. Last resort only: current sign-ins carry the combined grant and
   * resume with ZERO approvals via {@link getStatus} (cookie resume inside
   * `restorePersistedSession`); this flow is reached only by legacy sessions
   * without the paykit scope or cookies the homeserver rejects.
   */
  static async beginEnableFlow(ownerPubky: string): Promise<MessagingEnableFlow> {
    return await PaykitMessagingService.beginEnableFlow(ownerPubky);
  }

  static async getStatus(ownerPubky: string): Promise<MessagingStatus> {
    // Restore-before-report: the session resumes silently — persisted
    // metadata first, then purely from the sign-in cookie (the sign-in
    // grant covers /pub/paykit/:rw), each validated against the homeserver,
    // with receiver provisioning ensured on success — so surfaces never
    // show the enable/reconnect card while a valid session is actually
    // recoverable without a signer.
    return {
      sessionActive: await PaykitMessagingService.restorePersistedSession(ownerPubky),
      receiverProvisioned: await PaykitMessagingService.isReceiverProvisioned(ownerPubky),
    };
  }

  /** Sign-out teardown: drops the in-memory session and all live link handles. */
  static clearMessagingSession(): void {
    PaykitMessagingService.clearSession();
  }

  /** True when the counterparty has published a messaging receiver marker. */
  static async isCounterpartyEnrolled(counterpartyPubky: string): Promise<boolean> {
    return (await PaykitMessagingService.getCounterpartyMarker(counterpartyPubky)) !== null;
  }

  /**
   * Opens (or resumes) a marketplace listing conversation with a
   * counterparty: records the conversation row so inboxes list it even while
   * the handshake is queued, and drives the Encrypted Link one step forward.
   */
  static async openConversation(
    ownerPubky: string,
    counterpartyPubky: string,
    conversationId: string,
    listingRef: string,
  ): Promise<MessagingLinkState> {
    const state = await PaykitMessagingService.ensureLink(ownerPubky, counterpartyPubky);
    if (state.status !== 'not-enrolled') {
      await LocalMessagingService.touchConversation({
        owner_id: ownerPubky,
        conversation_id: conversationId,
        kind: 'listing',
        listing_ref: listingRef,
        counterparty_pubky: counterpartyPubky,
        last_message_at: null,
        updated_at: Date.now(),
      });
    }
    return state;
  }

  /**
   * Opens (or resumes) the general DM conversation with a counterparty. Same
   * link machinery as listing conversations; the conversation identity is the
   * counterparty pubky itself.
   */
  static async openDmConversation(ownerPubky: string, counterpartyPubky: string): Promise<MessagingLinkState> {
    const state = await PaykitMessagingService.ensureLink(ownerPubky, counterpartyPubky);
    if (state.status !== 'not-enrolled') {
      await LocalMessagingService.touchConversation({
        owner_id: ownerPubky,
        conversation_id: buildDmConversationId(counterpartyPubky),
        kind: 'dm',
        listing_ref: null,
        counterparty_pubky: counterpartyPubky,
        last_message_at: null,
        updated_at: Date.now(),
      });
    }
    return state;
  }

  /**
   * One bounded poll step for an open conversation with this counterparty:
   * advance the handshake if still queued, receive pending messages if the
   * link is ready. Kind-agnostic by construction — the shared link drains
   * BOTH message kinds and each is persisted into its own conversation.
   * Callers own scheduling (poll only while the surface is mounted and
   * visible).
   */
  static async pollConversation(
    ownerPubky: string,
    counterpartyPubky: string,
  ): Promise<{ state: MessagingLinkState; received: ReceivedMessage[] }> {
    const state = await PaykitMessagingService.ensureLink(ownerPubky, counterpartyPubky);
    if (state.status !== 'ready') return { state, received: [] };
    const received = await PaykitMessagingService.receiveMessages(ownerPubky, counterpartyPubky);
    return { state, received };
  }

  static async sendMessage(
    ownerPubky: string,
    counterpartyPubky: string,
    input: { conversationId: string; listingRef: string; body: string },
  ): Promise<MarketplaceChatMessage> {
    return await PaykitMessagingService.sendChatMessage(ownerPubky, counterpartyPubky, input);
  }

  static async sendDmMessage(ownerPubky: string, counterpartyPubky: string, body: string): Promise<PubkyAppDmMessage> {
    return await PaykitMessagingService.sendDmMessage(ownerPubky, counterpartyPubky, { body });
  }

  /** Moves the device-local read checkpoint of one conversation to now. */
  static async markConversationRead(ownerPubky: string, conversationId: string): Promise<void> {
    await LocalMessagingService.markConversationRead(ownerPubky, conversationId, Date.now());
  }

  /**
   * Honest device-local unread badge input: conversations with at least one
   * received-and-persisted message newer than the read checkpoint. Local
   * reads only — this never claims knowledge of undelivered mail.
   */
  static async getUnreadConversationCount(ownerPubky: string): Promise<number> {
    return await LocalMessagingService.countUnreadConversations(ownerPubky);
  }

  static async getConversationMessages(
    ownerPubky: string,
    conversationId: string,
  ): Promise<CommerceMessagingMessageModelSchema[]> {
    return await LocalMessagingService.getMessages(ownerPubky, conversationId);
  }

  static async getConversations(ownerPubky: string): Promise<MessagingConversationSummary[]> {
    const conversations = await LocalMessagingService.getConversationsByOwner(ownerPubky);
    return await Promise.all(
      conversations.map(async (conversation) => {
        const messages = await LocalMessagingService.getMessages(ownerPubky, conversation.conversation_id);
        return { ...conversation, lastMessage: messages.at(-1) ?? null };
      }),
    );
  }

  /**
   * Inbox sync: advances pending handshakes, answers queued inbound
   * handshakes, and receives messages for a bounded set of counterparties —
   * WITHOUT initiating anything. The binding cannot enumerate unknown inbound
   * initiators (no such API), so discovery is limited to counterparties this
   * account can NAME: existing conversations/links first (they always fit the
   * bound before new candidates), then the caller-supplied naming set —
   * marketplace order/offer participants plus the user's follows and
   * followers. A total stranger outside that set stays invisible until they
   * enter it; the UI discloses this instead of pretending otherwise.
   */
  static async syncCounterparties(ownerPubky: string, candidatePubkys: string[]): Promise<void> {
    // Insertion order is the probe priority: local messaging state (live or
    // pending conversations) must never be crowded out by fresh candidates.
    const known = new Set<string>();
    for (const link of await LocalMessagingService.getLinksByOwner(ownerPubky)) {
      known.add(link.counterparty_pubky);
    }
    for (const conversation of await LocalMessagingService.getConversationsByOwner(ownerPubky)) {
      known.add(conversation.counterparty_pubky);
    }
    for (const candidate of candidatePubkys) {
      known.add(candidate);
    }
    known.delete(ownerPubky);
    // Sequential on purpose: each probe is a couple of homeserver reads, and
    // parallel fan-out against one homeserver session buys nothing but load.
    for (const counterparty of [...known].slice(0, MESSAGING_SYNC_MAX_COUNTERPARTIES)) {
      const state = await PaykitMessagingService.probeCounterparty(ownerPubky, counterparty);
      if (state.status === 'ready') {
        await PaykitMessagingService.receiveMessages(ownerPubky, counterparty);
      }
    }
  }
}

/** Upper bound on counterparties probed per inbox sync pass. */
export const MESSAGING_SYNC_MAX_COUNTERPARTIES = 25;
