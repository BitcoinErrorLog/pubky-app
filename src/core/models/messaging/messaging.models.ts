import type { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { RecordModelBase } from '@/models/shared/base/record/baseRecord';
import type {
  CommerceMessagingConversationModelSchema,
  CommerceMessagingLinkModelSchema,
  CommerceMessagingMessageModelSchema,
  CommerceMessagingReceiverModelSchema,
} from './messaging.schema';

export class CommerceMessagingReceiverModel
  extends RecordModelBase<string, CommerceMessagingReceiverModelSchema>
  implements CommerceMessagingReceiverModelSchema
{
  static table: Table<CommerceMessagingReceiverModelSchema> = db.table('commerce_messaging_receivers');

  noise_secret: Uint8Array;
  noise_public_key: string;
  receiver_path: string;
  marker_published: boolean;
  created_at: number;
  updated_at: number;

  constructor(receiver: CommerceMessagingReceiverModelSchema) {
    super(receiver);
    this.noise_secret = receiver.noise_secret;
    this.noise_public_key = receiver.noise_public_key;
    this.receiver_path = receiver.receiver_path;
    this.marker_published = receiver.marker_published;
    this.created_at = receiver.created_at;
    this.updated_at = receiver.updated_at;
  }
}

export class CommerceMessagingLinkModel
  extends RecordModelBase<string, CommerceMessagingLinkModelSchema>
  implements CommerceMessagingLinkModelSchema
{
  static table: Table<CommerceMessagingLinkModelSchema> = db.table('commerce_messaging_links');

  owner_id: string;
  counterparty_pubky: string;
  role: CommerceMessagingLinkModelSchema['role'];
  status: CommerceMessagingLinkModelSchema['status'];
  local_receiver_path: string;
  remote_receiver_path: string;
  remote_noise_public_key: string;
  snapshot: Uint8Array;
  created_at: number;
  updated_at: number;

  constructor(link: CommerceMessagingLinkModelSchema) {
    super(link);
    this.owner_id = link.owner_id;
    this.counterparty_pubky = link.counterparty_pubky;
    this.role = link.role;
    this.status = link.status;
    this.local_receiver_path = link.local_receiver_path;
    this.remote_receiver_path = link.remote_receiver_path;
    this.remote_noise_public_key = link.remote_noise_public_key;
    this.snapshot = link.snapshot;
    this.created_at = link.created_at;
    this.updated_at = link.updated_at;
  }

  static async findByOwner(ownerId: string): Promise<CommerceMessagingLinkModelSchema[]> {
    try {
      return await this.table.where('owner_id').equals(ownerId).toArray();
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to query ${this.table.name} by owner`, {
        service: ErrorService.Local,
        operation: 'findByOwner',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }
}

export class CommerceMessagingConversationModel
  extends RecordModelBase<string, CommerceMessagingConversationModelSchema>
  implements CommerceMessagingConversationModelSchema
{
  static table: Table<CommerceMessagingConversationModelSchema> = db.table('commerce_messaging_conversations');

  owner_id: string;
  conversation_id: string;
  listing_ref: string;
  counterparty_pubky: string;
  last_message_at: number | null;
  created_at: number;
  updated_at: number;

  constructor(conversation: CommerceMessagingConversationModelSchema) {
    super(conversation);
    this.owner_id = conversation.owner_id;
    this.conversation_id = conversation.conversation_id;
    this.listing_ref = conversation.listing_ref;
    this.counterparty_pubky = conversation.counterparty_pubky;
    this.last_message_at = conversation.last_message_at;
    this.created_at = conversation.created_at;
    this.updated_at = conversation.updated_at;
  }

  static async findByOwner(ownerId: string): Promise<CommerceMessagingConversationModelSchema[]> {
    try {
      const conversations = await this.table.where('owner_id').equals(ownerId).toArray();
      return conversations.sort((left, right) => right.updated_at - left.updated_at);
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to query ${this.table.name} by owner`, {
        service: ErrorService.Local,
        operation: 'findByOwner',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }
}

export class CommerceMessagingMessageModel
  extends RecordModelBase<string, CommerceMessagingMessageModelSchema>
  implements CommerceMessagingMessageModelSchema
{
  static table: Table<CommerceMessagingMessageModelSchema> = db.table('commerce_messaging_messages');

  owner_id: string;
  conversation_id: string;
  listing_ref: string;
  counterparty_pubky: string;
  direction: CommerceMessagingMessageModelSchema['direction'];
  body: string;
  sent_at: string;
  recorded_at: number;

  constructor(message: CommerceMessagingMessageModelSchema) {
    super(message);
    this.owner_id = message.owner_id;
    this.conversation_id = message.conversation_id;
    this.listing_ref = message.listing_ref;
    this.counterparty_pubky = message.counterparty_pubky;
    this.direction = message.direction;
    this.body = message.body;
    this.sent_at = message.sent_at;
    this.recorded_at = message.recorded_at;
  }

  static async findByConversation(
    ownerId: string,
    conversationId: string,
  ): Promise<CommerceMessagingMessageModelSchema[]> {
    try {
      const messages = await this.table.where({ owner_id: ownerId, conversation_id: conversationId }).toArray();
      return messages.sort((left, right) => left.recorded_at - right.recorded_at);
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to query ${this.table.name} by conversation`, {
        service: ErrorService.Local,
        operation: 'findByConversation',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }
}
