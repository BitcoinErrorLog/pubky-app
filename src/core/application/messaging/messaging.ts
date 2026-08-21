import type { MarketplaceChatMessage } from '@/libs/commerce/messaging-contracts';
import type {
  CommerceMessagingConversationModelSchema,
  CommerceMessagingMessageModelSchema,
} from '@/models/messaging/messaging.schema';
import { LocalMessagingService } from '@/services/local/messaging/messaging';
import {
  type MessagingEnableFlow,
  type MessagingLinkState,
  PaykitMessagingService,
  type ReceivedChatMessage,
} from '@/services/paykit/paykit-messaging';

export type MessagingStatus = {
  /** A Ring-approved `/pub/paykit/:rw` session is live in this tab. */
  sessionActive: boolean;
  /** A receiver Noise key exists on this device and its marker was published. */
  receiverProvisioned: boolean;
};

export type MessagingConversationSummary = CommerceMessagingConversationModelSchema & {
  lastMessage: CommerceMessagingMessageModelSchema | null;
};

/**
 * Application layer for end-to-end-encrypted marketplace messaging (durable
 * commerce modes). Orchestrates the Paykit Encrypted Link service (network,
 * crypto, snapshot persistence) and the device-local history reads the UI
 * renders from. Message bodies never leave this layer toward logs, telemetry,
 * or projections.
 */
export class MessagingApplication {
  private constructor() {}

  /**
   * Starts the interactive "enable encrypted messaging" flow: a Ring approval
   * for the `/pub/paykit/:rw` grant, then receiver provisioning and marker
   * publish. This is messaging's OWN session — deliberately separate from the
   * marketplace transaction-service session (different capability, different
   * blast radius, its own explicit signer approval).
   */
  static async beginEnableFlow(ownerPubky: string): Promise<MessagingEnableFlow> {
    return await PaykitMessagingService.beginEnableFlow(ownerPubky);
  }

  static async getStatus(ownerPubky: string): Promise<MessagingStatus> {
    return {
      sessionActive: PaykitMessagingService.hasActiveSession(ownerPubky),
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
   * Opens (or resumes) the conversation with a counterparty: records the
   * conversation row so the inbox lists it even while the handshake is
   * queued, and drives the Encrypted Link one step forward.
   */
  static async openConversation(
    ownerPubky: string,
    counterpartyPubky: string,
    conversationId: string,
    listingRef: string,
  ): Promise<MessagingLinkState> {
    const state = await PaykitMessagingService.ensureLink(ownerPubky, counterpartyPubky);
    if (state.status !== 'not-enrolled') {
      const now = Date.now();
      await LocalMessagingService.touchConversation({
        owner_id: ownerPubky,
        conversation_id: conversationId,
        listing_ref: listingRef,
        counterparty_pubky: counterpartyPubky,
        last_message_at: null,
        updated_at: now,
      });
    }
    return state;
  }

  /**
   * One bounded poll step for an open conversation: advance the handshake if
   * still queued, receive pending messages if the link is ready. Callers own
   * scheduling (poll only while the surface is mounted and visible).
   */
  static async pollConversation(
    ownerPubky: string,
    counterpartyPubky: string,
  ): Promise<{ state: MessagingLinkState; received: ReceivedChatMessage[] }> {
    const state = await PaykitMessagingService.ensureLink(ownerPubky, counterpartyPubky);
    if (state.status !== 'ready') return { state, received: [] };
    const received = await PaykitMessagingService.receiveChatMessages(ownerPubky, counterpartyPubky);
    return { state, received };
  }

  static async sendMessage(
    ownerPubky: string,
    counterpartyPubky: string,
    input: { conversationId: string; listingRef: string; body: string },
  ): Promise<MarketplaceChatMessage> {
    return await PaykitMessagingService.sendChatMessage(ownerPubky, counterpartyPubky, input);
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
   * account already knows: existing conversations/links plus marketplace
   * order/offer participants supplied by the caller.
   */
  static async syncCounterparties(ownerPubky: string, candidatePubkys: string[]): Promise<void> {
    const known = new Set<string>(candidatePubkys);
    for (const link of await LocalMessagingService.getLinksByOwner(ownerPubky)) {
      known.add(link.counterparty_pubky);
    }
    for (const conversation of await LocalMessagingService.getConversationsByOwner(ownerPubky)) {
      known.add(conversation.counterparty_pubky);
    }
    known.delete(ownerPubky);
    // Sequential on purpose: each probe is a couple of homeserver reads, and
    // parallel fan-out against one homeserver session buys nothing but load.
    for (const counterparty of [...known].slice(0, MESSAGING_SYNC_MAX_COUNTERPARTIES)) {
      const state = await PaykitMessagingService.probeCounterparty(ownerPubky, counterparty);
      if (state.status === 'ready') {
        await PaykitMessagingService.receiveChatMessages(ownerPubky, counterparty);
      }
    }
  }
}

/** Upper bound on counterparties probed per inbox sync pass. */
export const MESSAGING_SYNC_MAX_COUNTERPARTIES = 25;
