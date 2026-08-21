/**
 * Account-scoped persistence for end-to-end-encrypted marketplace messaging
 * over Paykit Encrypted Links (durable commerce modes).
 *
 * SENSITIVITY — read before touching these tables:
 *
 * - `commerce_messaging_receivers.noise_secret` is the receiver-scoped Noise
 *   SECRET key. It is generated in this browser, never leaves it, and is never
 *   the Pubky identity secret. Whoever holds it (plus link snapshots) can
 *   decrypt this user's conversations.
 * - `commerce_messaging_links.snapshot` bytes serialize UNENCRYPTED and
 *   contain Noise key material (upstream pubky-noise documents caller-managed
 *   encryption as an open TODO). Encrypt-at-rest requires the multi-device
 *   backup-key decision, which is deliberately unmade — so these rows are
 *   stored exactly as the binding produces them, in the same account-scoped
 *   IndexedDB that already holds other sensitive local state (e.g. Locks
 *   bundle ids), and the UI DISCLOSES that history and key material are
 *   device-local. Do not sync, export, or log them.
 * - `commerce_messaging_messages.body` is plaintext message history, local to
 *   this device by design. Bodies never enter logs, telemetry, or projections.
 */

/**
 * One messaging receiver per account: the receiver Noise secret plus the
 * receiver path its public marker is published under. Losing this row breaks
 * every Encrypted Link the account has (a fresh receiver starts with no
 * history and counterparties must re-handshake).
 */
export interface CommerceMessagingReceiverModelSchema {
  /** Owner pubky (one receiver per account). */
  id: string;
  /** 32-byte receiver Noise secret key. SECRET — see file header. */
  noise_secret: Uint8Array;
  /** z-base-32 Noise public key, as published in the receiver marker. */
  noise_public_key: string;
  /** Paykit receiver path the marker is published under (e.g. `marketplace/wallet`). */
  receiver_path: string;
  /** True once `publishReceiverMarker` succeeded for this key. */
  marker_published: boolean;
  created_at: number;
  updated_at: number;
}

export const commerceMessagingReceiverTableSchema = '&id, updated_at';

export type CommerceMessagingLinkStatus = 'handshaking' | 'established';
export type CommerceMessagingLinkRole = 'initiator' | 'responder';

/**
 * One Encrypted Link (or in-progress handshake) per counterparty. `snapshot`
 * is the binding's serialized state — handshake snapshots restore via
 * `restoreEncryptedLinkHandshake`, established ones via `restoreEncryptedLink`.
 * Contains key material; see file header.
 */
export interface CommerceMessagingLinkModelSchema {
  /** `${owner_id}:${counterparty_pubky}` */
  id: string;
  owner_id: string;
  counterparty_pubky: string;
  role: CommerceMessagingLinkRole;
  status: CommerceMessagingLinkStatus;
  local_receiver_path: string;
  remote_receiver_path: string;
  /** Counterparty receiver Noise public key (z-base-32), from their marker. */
  remote_noise_public_key: string;
  /** Serialized link/handshake state. SECRET — see file header. */
  snapshot: Uint8Array;
  created_at: number;
  updated_at: number;
}

export const commerceMessagingLinkTableSchema = [
  '&id',
  'owner_id',
  'counterparty_pubky',
  'status',
  'updated_at',
  '[owner_id+status]',
].join(', ');

/**
 * One listing-scoped conversation this account participates in. Created when
 * the local user opens (initiates) a conversation, or when the first inbound
 * chat message referencing an unknown conversation arrives over a link.
 */
export interface CommerceMessagingConversationModelSchema {
  /** `${owner_id}:${conversation_id}` */
  id: string;
  owner_id: string;
  /** `conversation:{seller}_{buyer}_{listingId}` — matches the sandbox aggregate id. */
  conversation_id: string;
  /** `listing:{seller}:{listingId}` */
  listing_ref: string;
  counterparty_pubky: string;
  last_message_at: number | null;
  created_at: number;
  updated_at: number;
}

export const commerceMessagingConversationTableSchema = [
  '&id',
  'owner_id',
  'conversation_id',
  'counterparty_pubky',
  'updated_at',
  '[owner_id+updated_at]',
].join(', ');

export type CommerceMessagingDirection = 'sent' | 'received';

/**
 * Device-local message history (plaintext bodies; see file header). Keyed by
 * the sender-minted `event_id` so replayed deliveries (expected after a
 * snapshot restore) upsert idempotently instead of duplicating.
 */
export interface CommerceMessagingMessageModelSchema {
  /** `${owner_id}:${event_id}` */
  id: string;
  owner_id: string;
  conversation_id: string;
  listing_ref: string;
  counterparty_pubky: string;
  direction: CommerceMessagingDirection;
  body: string;
  /** Sender wall clock from the envelope (ISO-8601, display ordering only). */
  sent_at: string;
  /** Local receipt/persist time, the stable sort key on this device. */
  recorded_at: number;
}

export const commerceMessagingMessageTableSchema = [
  '&id',
  'owner_id',
  'conversation_id',
  'counterparty_pubky',
  'recorded_at',
  '[owner_id+conversation_id]',
].join(', ');
