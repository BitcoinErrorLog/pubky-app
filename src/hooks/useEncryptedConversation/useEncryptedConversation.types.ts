import type { CommerceMessagingMessageModelSchema } from '@/models/messaging/messaging.schema';

/**
 * The truthful states of one encrypted conversation surface. Every state maps
 * to a real transport fact — none of them claims delivery or readiness that
 * has not happened:
 *
 * - `loading`               — resolving local status; nothing known yet.
 * - `needs-enable`          — no live `/pub/paykit/:rw` session in this tab.
 *                             Either messaging was never enabled, or the tab
 *                             reloaded (sessions are memory-only by design)
 *                             and a fresh Ring approval is required.
 * - `not-enrolled`          — the counterparty has published no receiver
 *                             marker: encrypted messaging cannot reach them,
 *                             and the UI says so instead of faking delivery.
 * - `handshaking-initiator` — our handshake invitation is queued on the
 *                             homeservers. Noise XX needs the counterparty's
 *                             runtime to answer before ANY message can be
 *                             sent, so the composer stays disabled.
 * - `handshaking-responder` — an inbound handshake is being answered; the
 *                             final round needs the initiator online again.
 * - `ready`                 — the Encrypted Link is established; sending and
 *                             receiving are live.
 * - `error`                 — a real transport failure, with its message.
 */
export type EncryptedConversationStatus =
  | 'loading'
  | 'needs-enable'
  | 'not-enrolled'
  | 'handshaking-initiator'
  | 'handshaking-responder'
  | 'ready'
  | 'error';

export interface UseEncryptedConversationReturn {
  status: EncryptedConversationStatus;
  /** Real failure message when `status === 'error'`. */
  errorMessage: string | null;
  /** Device-local history for this conversation, oldest first. */
  messages: CommerceMessagingMessageModelSchema[];
  /** True when a receiver key already exists on this device (reconnect vs first enable copy). */
  receiverProvisioned: boolean;
  /** Composer draft, kept on send failure so nothing typed is lost. */
  draft: string;
  setDraft: (draft: string) => void;
  /** Serialized byte budget for the body in this conversation, and the draft's current cost. */
  bodyBudgetBytes: number;
  draftBytes: number;
  /** True while a send is in flight. */
  isSending: boolean;
  /** Send failure message from the last attempt, cleared on the next attempt. */
  sendError: string | null;
  send: () => Promise<boolean>;
  /** Re-runs status resolution (used after the enable dialog completes). */
  refresh: () => void;
}
