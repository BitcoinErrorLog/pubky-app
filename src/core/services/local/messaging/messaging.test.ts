import { beforeEach, describe, expect, it } from 'vitest';
import {
  CommerceMessagingConversationModel,
  CommerceMessagingLinkModel,
  CommerceMessagingMessageModel,
  CommerceMessagingReceiverModel,
} from '@/models/messaging/messaging.models';
import { LocalMessagingService } from './messaging';

const OWNER = 'a'.repeat(52);
const COUNTERPARTY = 'z'.repeat(52);
const CONVERSATION_ID = `conversation:${COUNTERPARTY}_${OWNER}_L1`;

function messageRow(eventSuffix: string, recordedAt: number) {
  return {
    owner_id: OWNER,
    conversation_id: CONVERSATION_ID,
    listing_ref: `listing:${COUNTERPARTY}:L1`,
    counterparty_pubky: COUNTERPARTY,
    direction: 'received' as const,
    body: `message ${eventSuffix}`,
    sent_at: 1_755_766_800_000,
    recorded_at: recordedAt,
  };
}

describe('LocalMessagingService', () => {
  beforeEach(async () => {
    await Promise.all([
      CommerceMessagingReceiverModel.clear(),
      CommerceMessagingLinkModel.clear(),
      CommerceMessagingConversationModel.clear(),
      CommerceMessagingMessageModel.clear(),
    ]);
  });

  it('stores one receiver per account keyed by pubky', async () => {
    await LocalMessagingService.upsertReceiver({
      id: OWNER,
      noise_secret: new Uint8Array(32).fill(7),
      noise_public_key: 'n'.repeat(52),
      receiver_path: 'marketplace/wallet',
      marker_published: true,
      created_at: 1,
      updated_at: 1,
    });
    const receiver = await LocalMessagingService.getReceiver(OWNER);
    // Spread: structured clone returns a different-realm Uint8Array.
    expect([...(receiver?.noise_secret ?? [])]).toEqual([...new Uint8Array(32).fill(7)]);
    await expect(LocalMessagingService.getReceiver(COUNTERPARTY)).resolves.toBeNull();
  });

  it('dedupes replayed messages by event id (idempotent upsert)', async () => {
    const eventId = crypto.randomUUID();
    await LocalMessagingService.upsertMessage(eventId, messageRow('one', 10));
    await LocalMessagingService.upsertMessage(eventId, messageRow('one-replayed', 20));
    const messages = await LocalMessagingService.getMessages(OWNER, CONVERSATION_ID);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe('message one-replayed');
  });

  it('returns conversation messages in recorded order', async () => {
    await LocalMessagingService.upsertMessage(crypto.randomUUID(), messageRow('late', 30));
    await LocalMessagingService.upsertMessage(crypto.randomUUID(), messageRow('early', 10));
    const messages = await LocalMessagingService.getMessages(OWNER, CONVERSATION_ID);
    expect(messages.map(({ body }) => body)).toEqual(['message early', 'message late']);
  });

  it('touchConversation creates once and only moves timestamps forward', async () => {
    await LocalMessagingService.touchConversation({
      owner_id: OWNER,
      conversation_id: CONVERSATION_ID,
      kind: 'listing',
      listing_ref: `listing:${COUNTERPARTY}:L1`,
      counterparty_pubky: COUNTERPARTY,
      last_message_at: 100,
      updated_at: 100,
    });
    // An older touch (out-of-order replay) must not regress the row.
    await LocalMessagingService.touchConversation({
      owner_id: OWNER,
      conversation_id: CONVERSATION_ID,
      kind: 'listing',
      listing_ref: `listing:${COUNTERPARTY}:L1`,
      counterparty_pubky: COUNTERPARTY,
      last_message_at: 50,
      updated_at: 50,
    });
    const conversations = await LocalMessagingService.getConversationsByOwner(OWNER);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].last_message_at).toBe(100);
    expect(conversations[0].updated_at).toBe(100);
    expect(conversations[0].created_at).toBe(100);
    // New rows start unread: the checkpoint belongs to markConversationRead.
    expect(conversations[0].last_read_at).toBeNull();
  });

  it('stores a dm conversation with no listing ref alongside a listing conversation', async () => {
    await LocalMessagingService.touchConversation({
      owner_id: OWNER,
      conversation_id: `dm:${COUNTERPARTY}`,
      kind: 'dm',
      listing_ref: null,
      counterparty_pubky: COUNTERPARTY,
      last_message_at: 10,
      updated_at: 10,
    });
    await LocalMessagingService.touchConversation({
      owner_id: OWNER,
      conversation_id: CONVERSATION_ID,
      kind: 'listing',
      listing_ref: `listing:${COUNTERPARTY}:L1`,
      counterparty_pubky: COUNTERPARTY,
      last_message_at: 20,
      updated_at: 20,
    });
    const conversations = await LocalMessagingService.getConversationsByOwner(OWNER);
    expect(conversations).toHaveLength(2);
    const dm = conversations.find(({ kind }) => kind === 'dm');
    expect(dm).toMatchObject({ conversation_id: `dm:${COUNTERPARTY}`, listing_ref: null });
  });

  it('markConversationRead moves the checkpoint forward only, and ignores unknown rows', async () => {
    // Unknown conversation: a no-op, never an implicit row.
    await LocalMessagingService.markConversationRead(OWNER, CONVERSATION_ID, 100);
    await expect(LocalMessagingService.getConversation(OWNER, CONVERSATION_ID)).resolves.toBeNull();

    await LocalMessagingService.touchConversation({
      owner_id: OWNER,
      conversation_id: CONVERSATION_ID,
      kind: 'listing',
      listing_ref: `listing:${COUNTERPARTY}:L1`,
      counterparty_pubky: COUNTERPARTY,
      last_message_at: 100,
      updated_at: 100,
    });
    await LocalMessagingService.markConversationRead(OWNER, CONVERSATION_ID, 200);
    // A stale (older) mark must not move the checkpoint backward.
    await LocalMessagingService.markConversationRead(OWNER, CONVERSATION_ID, 150);
    const conversation = await LocalMessagingService.getConversation(OWNER, CONVERSATION_ID);
    expect(conversation?.last_read_at).toBe(200);
  });

  it('counts unread conversations from RECEIVED messages after the checkpoint only', async () => {
    await LocalMessagingService.touchConversation({
      owner_id: OWNER,
      conversation_id: CONVERSATION_ID,
      kind: 'listing',
      listing_ref: `listing:${COUNTERPARTY}:L1`,
      counterparty_pubky: COUNTERPARTY,
      last_message_at: 100,
      updated_at: 100,
    });
    // A conversation with only SENT messages is never unread.
    await LocalMessagingService.upsertMessage(crypto.randomUUID(), {
      ...messageRow('mine', 100),
      direction: 'sent',
    });
    await expect(LocalMessagingService.countUnreadConversations(OWNER)).resolves.toBe(0);

    await LocalMessagingService.upsertMessage(crypto.randomUUID(), messageRow('theirs', 120));
    await expect(LocalMessagingService.countUnreadConversations(OWNER)).resolves.toBe(1);

    await LocalMessagingService.markConversationRead(OWNER, CONVERSATION_ID, 120);
    await expect(LocalMessagingService.countUnreadConversations(OWNER)).resolves.toBe(0);

    // A later received message flips it back to unread.
    await LocalMessagingService.upsertMessage(crypto.randomUUID(), messageRow('newer', 140));
    await expect(LocalMessagingService.countUnreadConversations(OWNER)).resolves.toBe(1);
  });

  it('updateLinkSnapshot refuses to write without an existing row', async () => {
    await expect(
      LocalMessagingService.updateLinkSnapshot(OWNER, COUNTERPARTY, new Uint8Array([1]), 'established', 1),
    ).rejects.toThrow(/No messaging link row/);
  });

  it('persists and updates link rows keyed by owner and counterparty', async () => {
    await LocalMessagingService.upsertLink({
      owner_id: OWNER,
      counterparty_pubky: COUNTERPARTY,
      role: 'initiator',
      status: 'handshaking',
      local_receiver_path: 'marketplace/wallet',
      remote_receiver_path: 'marketplace/wallet',
      remote_noise_public_key: 'p'.repeat(52),
      snapshot: new Uint8Array([1, 2]),
      created_at: 1,
      updated_at: 1,
    });
    await LocalMessagingService.updateLinkSnapshot(OWNER, COUNTERPARTY, new Uint8Array([3, 4]), 'established', 2);
    const link = await LocalMessagingService.getLink(OWNER, COUNTERPARTY);
    expect(link).toMatchObject({ status: 'established', updated_at: 2 });
    expect([...(link?.snapshot ?? [])]).toEqual([3, 4]);
    await LocalMessagingService.deleteLink(OWNER, COUNTERPARTY);
    await expect(LocalMessagingService.getLink(OWNER, COUNTERPARTY)).resolves.toBeNull();
  });
});
