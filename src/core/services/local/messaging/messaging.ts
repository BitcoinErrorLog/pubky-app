import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import {
  CommerceMessagingConversationModel,
  CommerceMessagingLinkModel,
  CommerceMessagingMessageModel,
  CommerceMessagingReceiverModel,
} from '@/models/messaging/messaging.models';
import type {
  CommerceMessagingConversationModelSchema,
  CommerceMessagingLinkModelSchema,
  CommerceMessagingMessageModelSchema,
  CommerceMessagingReceiverModelSchema,
} from '@/models/messaging/messaging.schema';

/**
 * Account-scoped Dexie persistence for encrypted marketplace messaging.
 *
 * Everything here is DEVICE-LOCAL by design: the receiver Noise secret and
 * link snapshots are key material stored as the binding produces them
 * (encrypt-at-rest awaits the backup-key decision — see
 * `docs/ecommerce/paykit-wasm-provenance.md`), and message bodies are local
 * plaintext history. None of it syncs anywhere, and none of it may enter
 * logs, telemetry, or projections.
 */
export class LocalMessagingService {
  private constructor() {}

  static async getReceiver(ownerId: string): Promise<CommerceMessagingReceiverModelSchema | null> {
    return await CommerceMessagingReceiverModel.findById(ownerId);
  }

  static async upsertReceiver(receiver: CommerceMessagingReceiverModelSchema): Promise<void> {
    await CommerceMessagingReceiverModel.upsert(receiver);
  }

  static async getLink(ownerId: string, counterpartyPubky: string): Promise<CommerceMessagingLinkModelSchema | null> {
    return await CommerceMessagingLinkModel.findById(this.linkId(ownerId, counterpartyPubky));
  }

  static async getLinksByOwner(ownerId: string): Promise<CommerceMessagingLinkModelSchema[]> {
    return await CommerceMessagingLinkModel.findByOwner(ownerId);
  }

  static async upsertLink(link: Omit<CommerceMessagingLinkModelSchema, 'id'>): Promise<void> {
    await CommerceMessagingLinkModel.upsert({
      ...link,
      id: this.linkId(link.owner_id, link.counterparty_pubky),
    });
  }

  static async deleteLink(ownerId: string, counterpartyPubky: string): Promise<void> {
    await CommerceMessagingLinkModel.deleteById(this.linkId(ownerId, counterpartyPubky));
  }

  /**
   * Persists a fresh link snapshot for an existing row. Callers MUST persist
   * any received messages BEFORE calling this — the binding's read checkpoint
   * advances past returned messages, so an old snapshot is the only way to
   * re-read them after a crash.
   */
  static async updateLinkSnapshot(
    ownerId: string,
    counterpartyPubky: string,
    snapshot: Uint8Array,
    status: CommerceMessagingLinkModelSchema['status'],
    now: number,
  ): Promise<void> {
    const current = await this.getLink(ownerId, counterpartyPubky);
    if (!current) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'No messaging link row exists for this counterparty.', {
        service: ErrorService.Local,
        operation: 'updateLinkSnapshot',
      });
    }
    await CommerceMessagingLinkModel.upsert({ ...current, snapshot, status, updated_at: now });
  }

  static async getConversationsByOwner(ownerId: string): Promise<CommerceMessagingConversationModelSchema[]> {
    return await CommerceMessagingConversationModel.findByOwner(ownerId);
  }

  static async getConversation(
    ownerId: string,
    conversationId: string,
  ): Promise<CommerceMessagingConversationModelSchema | null> {
    return await CommerceMessagingConversationModel.findById(`${ownerId}:${conversationId}`);
  }

  /**
   * Creates the conversation row if absent; bumps `last_message_at`/`updated_at`
   * if newer. The read checkpoint (`last_read_at`) is owned by
   * `markConversationRead` and is never touched here.
   */
  static async touchConversation(
    conversation: Omit<CommerceMessagingConversationModelSchema, 'id' | 'created_at' | 'last_read_at'>,
  ): Promise<void> {
    const id = `${conversation.owner_id}:${conversation.conversation_id}`;
    const current = await CommerceMessagingConversationModel.findById(id);
    if (!current) {
      await CommerceMessagingConversationModel.upsert({
        ...conversation,
        id,
        last_read_at: null,
        created_at: conversation.updated_at,
      });
      return;
    }
    await CommerceMessagingConversationModel.upsert({
      ...current,
      last_message_at: latest(current.last_message_at, conversation.last_message_at),
      updated_at: Math.max(current.updated_at, conversation.updated_at),
    });
  }

  /**
   * Moves the device-local read checkpoint forward (never backward). Called
   * when the conversation surface is actually showing its messages.
   */
  static async markConversationRead(ownerId: string, conversationId: string, now: number): Promise<void> {
    const current = await CommerceMessagingConversationModel.findById(`${ownerId}:${conversationId}`);
    if (!current) return;
    if (current.last_read_at !== null && current.last_read_at >= now) return;
    await CommerceMessagingConversationModel.upsert({ ...current, last_read_at: now });
  }

  /**
   * Honest device-local unread: conversations holding at least one RECEIVED
   * message persisted after the read checkpoint. Counts only messages that
   * already arrived on this device — it can never claim knowledge of
   * undelivered mail sitting on a homeserver.
   */
  static async countUnreadConversations(ownerId: string): Promise<{ total: number; marketplace: number }> {
    const conversations = await CommerceMessagingConversationModel.findByOwner(ownerId);
    let total = 0;
    let marketplace = 0;
    for (const conversation of conversations) {
      const checkpoint = conversation.last_read_at ?? 0;
      const messages = await CommerceMessagingMessageModel.findByConversation(ownerId, conversation.conversation_id);
      if (messages.some((message) => message.direction === 'received' && message.recorded_at > checkpoint)) {
        total += 1;
        // Marketplace (listing) conversations get their own nav badge — they
        // are operationally time-sensitive; the Messages badge carries the rest.
        if (conversation.kind === 'listing') marketplace += 1;
      }
    }
    return { total, marketplace };
  }

  static async getMessages(ownerId: string, conversationId: string): Promise<CommerceMessagingMessageModelSchema[]> {
    return await CommerceMessagingMessageModel.findByConversation(ownerId, conversationId);
  }

  /**
   * Idempotent by construction: the row id is `${owner}:${event_id}` (the
   * sender-minted envelope UUID), so a replayed delivery (expected after a
   * snapshot restore) overwrites itself instead of duplicating.
   */
  static async upsertMessage(eventId: string, message: Omit<CommerceMessagingMessageModelSchema, 'id'>): Promise<void> {
    await CommerceMessagingMessageModel.upsert({ ...message, id: `${message.owner_id}:${eventId}` });
  }

  private static linkId(ownerId: string, counterpartyPubky: string): string {
    return `${ownerId}:${counterpartyPubky}`;
  }
}

function latest(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}
