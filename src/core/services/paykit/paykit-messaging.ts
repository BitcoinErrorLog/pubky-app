// Type-only imports are erased at compile time; the WASM module itself is only ever
// loaded through the dynamic import in loadPaykitWasm(), never at module scope, so this
// file stays safe to pull into server-rendered module graphs (same rule as the Locks SDK).
import type { EncryptedLinkHandle, LinkHandshakeHandle, PubkyClient, SessionHandle } from 'paykit-wasm';
import { getCommerceAdapterMode, isDurableCommerceMode } from '@/config/commerce';
import {
  buildChatMessage,
  decodeChatMessage,
  type MarketplaceChatMessage,
  PAYKIT_MESSAGING_CAPABILITY,
  PAYKIT_MESSAGING_RECEIVER_PATH,
} from '@/libs/commerce/messaging-contracts';
import { isAppError } from '@/libs/error/error';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { getTestnet } from '@/libs/runtime-config/runtime-config';
import { LocalMessagingService } from '@/services/local/messaging/messaging';

type PaykitWasmModule = typeof import('paykit-wasm');

let wasmModulePromise: Promise<PaykitWasmModule> | null = null;
let moduleOverrideForTests: PaykitWasmModule | null = null;

/**
 * Loads and initializes the vendored paykit-wasm binding exactly once. The dynamic
 * import keeps the ~1.5 MB WASM binary out of every server-rendered and initial-client
 * module graph; it is only fetched when a messaging operation actually runs in the
 * browser. Mirrors the Locks SDK loading pattern (locks.ts).
 */
async function loadPaykitWasm(): Promise<PaykitWasmModule> {
  if (moduleOverrideForTests) return moduleOverrideForTests;
  wasmModulePromise ??= (async () => {
    const sdk = await import('paykit-wasm');
    await sdk.default();
    return sdk;
  })();
  try {
    return await wasmModulePromise;
  } catch (error) {
    // A failed WASM fetch/instantiation must stay retryable on the next call.
    wasmModulePromise = null;
    throw error;
  }
}

/**
 * Test seam: unit tests initialize the REAL vendored module from file bytes
 * (jsdom cannot fetch the .wasm asset) — or a purpose-built fake for
 * orchestration-logic tests — and inject it here. Never used in production.
 */
export function setPaykitWasmModuleForTests(wasmModule: PaykitWasmModule | null): void {
  moduleOverrideForTests = wasmModule;
  wasmModulePromise = null;
}

/** Marker facts for a counterparty who has enabled encrypted messaging. */
export type CounterpartyMessagingMarker = {
  receiverPath: string;
  noisePublicKey: string;
};

export type MessagingEnableFlow = {
  authorizationUrl: string;
  awaitEnabled: () => Promise<MessagingEnabledInfo>;
  cancel: () => void;
};

export type MessagingEnabledInfo = {
  pubky: string;
  receiverPath: string;
  noisePublicKey: string;
};

/**
 * The truthful conversation transport states, empirically grounded in the
 * binding's semantics:
 *
 * - `not-enrolled`: the counterparty has published no receiver marker — no
 *   handshake can even start, and the UI must say so, never fake delivery.
 * - `handshaking`: a Noise XX handshake is queued on the homeservers. XX
 *   needs BOTH parties: the initiator writes message 1 and then CANNOT send
 *   application messages until the counterparty's runtime reads it and
 *   answers (messages 2/3 alternate). So `role: 'initiator'` means "waiting
 *   for the counterparty to open their messages"; `role: 'responder'` means
 *   an inbound handshake is being answered and completion needs the
 *   initiator to come back online for the final round.
 * - `ready`: the link is established; sends/receives are live.
 */
export type MessagingLinkState =
  | { status: 'not-enrolled' }
  | { status: 'handshaking'; role: 'initiator' | 'responder' }
  | { status: 'ready' };

/** Probe-only result: `none` means no local state and no inbound handshake — nothing was started. */
export type MessagingProbeState = MessagingLinkState | { status: 'none' };

export type ReceivedChatMessage = MarketplaceChatMessage & { counterpartyPubky: string };

type ActiveSession = { handle: SessionHandle; pubky: string };
type ActiveHandshake = { handle: LinkHandshakeHandle; role: 'initiator' | 'responder' };

/**
 * End-to-end-encrypted marketplace messaging over Paykit Encrypted Links
 * (vendored paykit-wasm binding, durable commerce modes only — the sandbox
 * keeps its own labeled plaintext transport).
 *
 * Key facts the rest of the app relies on:
 *
 * - The homeserver session comes from a Ring-approved `pubkyauth` grant for
 *   `/pub/paykit/:rw` — its own approval, NEVER the marketplace
 *   transaction-service session, and the Pubky identity secret never enters
 *   this runtime. The session handle lives in memory only and dies with the
 *   tab; reconnecting requires a fresh signer approval.
 * - Link crypto uses a receiver-scoped Noise key generated here and persisted
 *   in account-scoped IndexedDB (`commerce_messaging_receivers`); snapshots
 *   are persisted as produced — unencrypted, containing key material — with
 *   that fact disclosed in the UI (backup-key encryption is an open product
 *   decision, deliberately not improvised here).
 * - The binding rejects overlapping operations per link ("operation in
 *   flight"), so every public operation is serialized per counterparty.
 * - Received messages are persisted BEFORE the advanced link snapshot — the
 *   read checkpoint moves past returned messages, so the reversed order
 *   would lose them on a crash.
 */
export class PaykitMessagingService {
  private constructor() {}

  private static session: ActiveSession | null = null;
  private static client: PubkyClient | null = null;
  private static links = new Map<string, EncryptedLinkHandle>();
  private static handshakes = new Map<string, ActiveHandshake>();
  private static queues = new Map<string, Promise<unknown>>();

  /**
   * Starts the interactive enable flow: a fresh `pubkyauth://` URL for the
   * `/pub/paykit/:rw` grant to show on the user's signer, and a lazy
   * `awaitEnabled` that — once approved — verifies the approving identity,
   * provisions (or reuses) the receiver Noise key, and publishes the receiver
   * marker that makes this user discoverable for encrypted messaging.
   *
   * `cancel` detaches the flow: the binding exposes no abort for a pending
   * approval, so a later approval on a detached flow is dropped (its session
   * handle is freed unused).
   */
  static async beginEnableFlow(expectedPubky: string): Promise<MessagingEnableFlow> {
    this.assertDurableMode('beginEnableFlow');
    const wasmModule = await loadPaykitWasm();
    const client = this.getClient(wasmModule);
    const flow = client.startAuthFlow(PAYKIT_MESSAGING_CAPABILITY);
    let detached = false;
    return {
      authorizationUrl: flow.authorizationUrl(),
      cancel: () => {
        detached = true;
      },
      awaitEnabled: async () => {
        const handle = (await flow.awaitApproval()) as SessionHandle;
        if (detached) {
          handle.free();
          throw Err.client(ClientErrorCode.BAD_REQUEST, 'The messaging enable flow was cancelled.', {
            service: ErrorService.Paykit,
            operation: 'awaitEnabled',
          });
        }
        const pubky = handle.pubky();
        if (pubky !== expectedPubky) {
          handle.free();
          throw Err.auth(
            AuthErrorCode.INVALID_TOKEN,
            'The signer approved with a different identity than the signed-in user.',
            { service: ErrorService.Paykit, operation: 'awaitEnabled' },
          );
        }
        const enabled = await this.provisionReceiver(wasmModule, handle, pubky);
        this.setSession({ handle, pubky });
        return enabled;
      },
    };
  }

  /** True while a Ring-approved messaging session for this pubky is held in memory. */
  static hasActiveSession(pubky: string): boolean {
    return this.session?.pubky === pubky;
  }

  /**
   * Live-test seam: runs the REAL receiver provisioning and marker publish
   * for a session obtained through the binding's dev/test signup helpers
   * (`signupWithSecret` against an ephemeral local testnet) instead of the
   * Ring approval. Everything downstream — markers, links, crypto,
   * persistence — is the production path; only the interactive signer leg is
   * swapped, exactly as the binding's own e2e does. Never called in
   * production code.
   */
  static async enableWithSessionForTests(handle: SessionHandle): Promise<MessagingEnabledInfo> {
    const wasmModule = await loadPaykitWasm();
    const pubky = handle.pubky();
    const enabled = await this.provisionReceiver(wasmModule, handle, pubky);
    this.setSession({ handle, pubky });
    return enabled;
  }

  /** Facts about local provisioning (no network): has a receiver key + published marker. */
  static async isReceiverProvisioned(pubky: string): Promise<boolean> {
    const receiver = await LocalMessagingService.getReceiver(pubky);
    return Boolean(receiver?.marker_published);
  }

  /** Drops the in-memory session and every live link/handshake handle. Sign-out teardown. */
  static clearSession(): void {
    for (const link of this.links.values()) closeQuietly(() => void link.close());
    for (const handshake of this.handshakes.values()) closeQuietly(() => handshake.handle.free());
    this.links.clear();
    this.handshakes.clear();
    this.queues.clear();
    if (this.session) closeQuietly(() => this.session?.handle.free());
    this.session = null;
    // The client is stateless config; dropping it costs one lazy re-create
    // and keeps a test-injected module from leaking a stale client.
    this.client = null;
  }

  /**
   * Whether a counterparty can receive encrypted messages at all: they must
   * have published a receiver marker (i.e. enabled messaging themselves).
   * Public read — needs no session.
   */
  static async getCounterpartyMarker(counterpartyPubky: string): Promise<CounterpartyMessagingMarker | null> {
    this.assertDurableMode('getCounterpartyMarker');
    const wasmModule = await loadPaykitWasm();
    const client = this.getClient(wasmModule);
    const marker = (await wasmModule.getReceiverMarker(client, counterpartyPubky, PAYKIT_MESSAGING_RECEIVER_PATH)) as
      | { receiverPath: string; noisePublicKey: string }
      | undefined;
    if (!marker) return null;
    return { receiverPath: marker.receiverPath, noisePublicKey: marker.noisePublicKey };
  }

  /**
   * Brings the Encrypted Link toward `counterpartyPubky` as far as one poll
   * step allows and reports the truthful state. Serialized per counterparty.
   */
  static async ensureLink(ownerPubky: string, counterpartyPubky: string): Promise<MessagingLinkState> {
    return await this.withQueue(counterpartyPubky, async () => {
      const state = await this.ensureLinkLocked(ownerPubky, counterpartyPubky, true);
      // `allowInitiate` guarantees the probe-only 'none' branch is unreachable.
      return state as MessagingLinkState;
    });
  }

  /**
   * Advances existing state and answers queued inbound handshakes for one
   * counterparty WITHOUT ever initiating a new handshake — the inbox sync
   * path. The binding exposes no way to enumerate unknown inbound initiators,
   * so probing is limited to counterparties this account already knows
   * (existing conversations/links plus marketplace order/offer participants).
   */
  static async probeCounterparty(ownerPubky: string, counterpartyPubky: string): Promise<MessagingProbeState> {
    return await this.withQueue(counterpartyPubky, () => this.ensureLinkLocked(ownerPubky, counterpartyPubky, false));
  }

  /**
   * Sends one chat message over an established link. Enforces the 1000-byte
   * serialized ceiling before the crypto layer would reject it anyway. On
   * success the message row is persisted (direction `sent`) and THEN the
   * advanced link snapshot; a failure leaves no message row behind — the UI
   * keeps the draft and shows the real error.
   */
  static async sendChatMessage(
    ownerPubky: string,
    counterpartyPubky: string,
    input: { conversationId: string; listingRef: string; body: string },
  ): Promise<MarketplaceChatMessage> {
    return await this.withQueue(counterpartyPubky, async () => {
      const state = await this.ensureLinkLocked(ownerPubky, counterpartyPubky, true);
      if (state.status !== 'ready') {
        throw Err.client(ClientErrorCode.BAD_REQUEST, 'The encrypted link is not established yet.', {
          service: ErrorService.Paykit,
          operation: 'sendChatMessage',
          context: { linkStatus: state.status },
        });
      }
      const link = this.links.get(this.linkKey(ownerPubky, counterpartyPubky));
      if (!link) {
        throw Err.server(ServerErrorCode.UNKNOWN_ERROR, 'The encrypted link handle is missing.', {
          service: ErrorService.Paykit,
          operation: 'sendChatMessage',
        });
      }
      const { message, json } = buildChatMessage({
        eventId: crypto.randomUUID(),
        conversationId: input.conversationId,
        listingRef: input.listingRef,
        sentAt: new Date().toISOString(),
        body: input.body,
      });
      await link.sendPrivateApplicationMessageJson(json);
      const now = Date.now();
      await LocalMessagingService.upsertMessage(message.event_id, {
        owner_id: ownerPubky,
        conversation_id: message.conversation_id,
        listing_ref: message.listing_ref,
        counterparty_pubky: counterpartyPubky,
        direction: 'sent',
        body: message.body,
        sent_at: message.sent_at,
        recorded_at: now,
      });
      await LocalMessagingService.touchConversation({
        owner_id: ownerPubky,
        conversation_id: message.conversation_id,
        listing_ref: message.listing_ref,
        counterparty_pubky: counterpartyPubky,
        last_message_at: now,
        updated_at: now,
      });
      await this.persistLinkSnapshot(ownerPubky, counterpartyPubky, link);
      return message;
    });
  }

  /**
   * Receives pending inbound messages on an established link. Unknown kinds
   * are skipped (legal on a shared link). Message rows and conversation rows
   * are persisted BEFORE the advanced snapshot.
   */
  static async receiveChatMessages(ownerPubky: string, counterpartyPubky: string): Promise<ReceivedChatMessage[]> {
    return await this.withQueue(counterpartyPubky, async () => {
      const link = this.links.get(this.linkKey(ownerPubky, counterpartyPubky));
      if (!link) return [];
      const inbound = (await link.receivePrivateApplicationMessages()) as { rawJson: string }[];
      const received: ReceivedChatMessage[] = [];
      const now = Date.now();
      for (const item of inbound) {
        const message = decodeChatMessage(item.rawJson);
        if (!message) continue;
        await LocalMessagingService.upsertMessage(message.event_id, {
          owner_id: ownerPubky,
          conversation_id: message.conversation_id,
          listing_ref: message.listing_ref,
          counterparty_pubky: counterpartyPubky,
          direction: 'received',
          body: message.body,
          sent_at: message.sent_at,
          recorded_at: now,
        });
        await LocalMessagingService.touchConversation({
          owner_id: ownerPubky,
          conversation_id: message.conversation_id,
          listing_ref: message.listing_ref,
          counterparty_pubky: counterpartyPubky,
          last_message_at: now,
          updated_at: now,
        });
        received.push({ ...message, counterpartyPubky });
      }
      if (inbound.length > 0) {
        await this.persistLinkSnapshot(ownerPubky, counterpartyPubky, link);
      }
      return received;
    });
  }

  // --- internals -----------------------------------------------------------

  private static async ensureLinkLocked(
    ownerPubky: string,
    counterpartyPubky: string,
    allowInitiate: boolean,
  ): Promise<MessagingProbeState> {
    const wasmModule = await loadPaykitWasm();
    const session = this.requireSession(ownerPubky);
    const key = this.linkKey(ownerPubky, counterpartyPubky);

    if (this.links.has(key)) return { status: 'ready' };

    const active = this.handshakes.get(key);
    if (active) {
      return await this.advanceHandshake(wasmModule, ownerPubky, counterpartyPubky, active);
    }

    const stored = await LocalMessagingService.getLink(ownerPubky, counterpartyPubky);
    const receiver = await this.requireReceiver(ownerPubky);

    if (stored?.status === 'established') {
      const link = (await wasmModule.restoreEncryptedLink(
        session.handle,
        receiver.noise_secret,
        counterpartyPubky,
        stored.local_receiver_path,
        stored.remote_receiver_path,
        this.getClient(wasmModule),
        stored.snapshot,
      )) as EncryptedLinkHandle;
      this.links.set(key, link);
      return { status: 'ready' };
    }

    if (stored?.status === 'handshaking') {
      try {
        const handle = (await wasmModule.restoreEncryptedLinkHandshake(
          session.handle,
          receiver.noise_secret,
          counterpartyPubky,
          stored.local_receiver_path,
          stored.remote_receiver_path,
          this.getClient(wasmModule),
          stored.snapshot,
        )) as LinkHandshakeHandle;
        const handshake: ActiveHandshake = { handle, role: stored.role };
        this.handshakes.set(key, handshake);
        return await this.advanceHandshake(wasmModule, ownerPubky, counterpartyPubky, handshake);
      } catch (error) {
        // An unrecoverable mid-handshake snapshot must not wedge the pair
        // forever: drop the row and our stale outbox slots so the next poll
        // starts a fresh handshake (the documented recovery path).
        Logger.warn('Failed to restore a mid-handshake snapshot; clearing state for a fresh handshake', { error });
        await LocalMessagingService.deleteLink(ownerPubky, counterpartyPubky);
        await wasmModule.clearEncryptedLinkOutbox(
          session.handle,
          receiver.noise_secret,
          counterpartyPubky,
          stored.remote_noise_public_key,
          stored.local_receiver_path,
          stored.remote_receiver_path,
        );
        return { status: 'handshaking', role: stored.role };
      }
    }

    // No local state at all: discover the counterparty, prefer answering an
    // inbound handshake if one is queued, otherwise initiate our own.
    const marker = await this.getCounterpartyMarkerWith(wasmModule, counterpartyPubky);
    if (!marker) return allowInitiate ? { status: 'not-enrolled' } : { status: 'none' };

    const inbound = await this.probeInboundHandshake(wasmModule, session, receiver, counterpartyPubky, marker);
    if (inbound) {
      return await this.adoptHandshakeProgress(ownerPubky, counterpartyPubky, marker, receiver.receiver_path, inbound);
    }

    if (!allowInitiate) return { status: 'none' };

    const handle = wasmModule.initiateEncryptedLink(
      session.handle,
      receiver.noise_secret,
      counterpartyPubky,
      marker.noisePublicKey,
      receiver.receiver_path,
      marker.receiverPath,
      this.getClient(wasmModule),
    );
    const handshake: ActiveHandshake = { handle, role: 'initiator' };
    this.handshakes.set(this.linkKey(ownerPubky, counterpartyPubky), handshake);
    await LocalMessagingService.upsertLink({
      owner_id: ownerPubky,
      counterparty_pubky: counterpartyPubky,
      role: 'initiator',
      status: 'handshaking',
      local_receiver_path: receiver.receiver_path,
      remote_receiver_path: marker.receiverPath,
      remote_noise_public_key: marker.noisePublicKey,
      snapshot: handle.snapshot(),
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    return await this.advanceHandshake(wasmModule, ownerPubky, counterpartyPubky, handshake);
  }

  /**
   * One handshake step. On `pending`, persists the advanced snapshot so a
   * reload resumes instead of restarting. On error the in-memory handshake is
   * consumed (paykit-lib ownership model); the persisted snapshot restores it
   * on the next poll. When our own initiated handshake stalls, the
   * lexicographically smaller pubky additionally probes for a CROSSED inbound
   * handshake (both sides initiated at once) and switches to answering it —
   * the deterministic tiebreak that keeps exactly one side switching.
   */
  private static async advanceHandshake(
    wasmModule: PaykitWasmModule,
    ownerPubky: string,
    counterpartyPubky: string,
    handshake: ActiveHandshake,
  ): Promise<MessagingLinkState> {
    const key = this.linkKey(ownerPubky, counterpartyPubky);
    let result: { status: string; link?: EncryptedLinkHandle };
    try {
      result = (await handshake.handle.advance()) as { status: string; link?: EncryptedLinkHandle };
    } catch (error) {
      this.handshakes.delete(key);
      Logger.warn('Encrypted link handshake step failed; will restore from the persisted snapshot', { error });
      return { status: 'handshaking', role: handshake.role };
    }

    if (result.status === 'complete' && result.link) {
      this.handshakes.delete(key);
      this.links.set(key, result.link);
      await this.persistLinkSnapshot(ownerPubky, counterpartyPubky, result.link);
      return { status: 'ready' };
    }

    await this.persistHandshakeSnapshot(ownerPubky, counterpartyPubky, handshake);

    if (handshake.role === 'initiator' && ownerPubky < counterpartyPubky) {
      const session = this.requireSession(ownerPubky);
      const receiver = await this.requireReceiver(ownerPubky);
      const marker = await this.getCounterpartyMarkerWith(wasmModule, counterpartyPubky);
      if (marker) {
        const inbound = await this.probeInboundHandshake(wasmModule, session, receiver, counterpartyPubky, marker);
        if (inbound) {
          closeQuietly(() => handshake.handle.free());
          this.handshakes.delete(key);
          return await this.adoptHandshakeProgress(
            ownerPubky,
            counterpartyPubky,
            marker,
            receiver.receiver_path,
            inbound,
          );
        }
      }
    }

    return { status: 'handshaking', role: handshake.role };
  }

  /**
   * Answers a possibly-queued inbound handshake: creates responder state and
   * advances once. The binding reports `pending` both for "nothing inbound"
   * and "read message 1, wrote message 2", so progress is detected by
   * comparing snapshots — identical bytes mean nothing was read and the
   * probe state is discarded.
   */
  private static async probeInboundHandshake(
    wasmModule: PaykitWasmModule,
    session: ActiveSession,
    receiver: { noise_secret: Uint8Array; receiver_path: string },
    counterpartyPubky: string,
    marker: CounterpartyMessagingMarker,
  ): Promise<{ handshake?: ActiveHandshake; link?: EncryptedLinkHandle } | null> {
    const handle = wasmModule.acceptEncryptedLink(
      session.handle,
      receiver.noise_secret,
      counterpartyPubky,
      marker.noisePublicKey,
      receiver.receiver_path,
      marker.receiverPath,
      this.getClient(wasmModule),
    );
    const before = handle.snapshot();
    let result: { status: string; link?: EncryptedLinkHandle };
    try {
      result = (await handle.advance()) as { status: string; link?: EncryptedLinkHandle };
    } catch {
      // A failed probe step is not an inbound handshake; the consumed probe
      // state was never persisted, so there is nothing to recover.
      return null;
    }
    if (result.status === 'complete' && result.link) {
      return { link: result.link };
    }
    const after = handle.snapshot();
    if (bytesEqual(before, after)) {
      closeQuietly(() => handle.free());
      return null;
    }
    return { handshake: { handle, role: 'responder' } };
  }

  /** Persists whichever stage the adopted inbound handshake reached. */
  private static async adoptHandshakeProgress(
    ownerPubky: string,
    counterpartyPubky: string,
    marker: CounterpartyMessagingMarker,
    localReceiverPath: string,
    inbound: { handshake?: ActiveHandshake; link?: EncryptedLinkHandle },
  ): Promise<MessagingLinkState> {
    const key = this.linkKey(ownerPubky, counterpartyPubky);
    const now = Date.now();
    if (inbound.link) {
      this.links.set(key, inbound.link);
      await LocalMessagingService.upsertLink({
        owner_id: ownerPubky,
        counterparty_pubky: counterpartyPubky,
        role: 'responder',
        status: 'established',
        local_receiver_path: localReceiverPath,
        remote_receiver_path: marker.receiverPath,
        remote_noise_public_key: marker.noisePublicKey,
        snapshot: inbound.link.snapshot(),
        created_at: now,
        updated_at: now,
      });
      return { status: 'ready' };
    }
    if (inbound.handshake) {
      this.handshakes.set(key, inbound.handshake);
      await LocalMessagingService.upsertLink({
        owner_id: ownerPubky,
        counterparty_pubky: counterpartyPubky,
        role: 'responder',
        status: 'handshaking',
        local_receiver_path: localReceiverPath,
        remote_receiver_path: marker.receiverPath,
        remote_noise_public_key: marker.noisePublicKey,
        snapshot: inbound.handshake.handle.snapshot(),
        created_at: now,
        updated_at: now,
      });
      return { status: 'handshaking', role: 'responder' };
    }
    return { status: 'handshaking', role: 'responder' };
  }

  private static async persistLinkSnapshot(
    ownerPubky: string,
    counterpartyPubky: string,
    link: EncryptedLinkHandle,
  ): Promise<void> {
    await LocalMessagingService.updateLinkSnapshot(
      ownerPubky,
      counterpartyPubky,
      link.snapshot(),
      'established',
      Date.now(),
    );
  }

  private static async persistHandshakeSnapshot(
    ownerPubky: string,
    counterpartyPubky: string,
    handshake: ActiveHandshake,
  ): Promise<void> {
    await LocalMessagingService.updateLinkSnapshot(
      ownerPubky,
      counterpartyPubky,
      handshake.handle.snapshot(),
      'handshaking',
      Date.now(),
    );
  }

  private static async provisionReceiver(
    wasmModule: PaykitWasmModule,
    session: SessionHandle,
    pubky: string,
  ): Promise<MessagingEnabledInfo> {
    const now = Date.now();
    let receiver = await LocalMessagingService.getReceiver(pubky);
    if (!receiver) {
      const noiseSecret = wasmModule.generateNoiseSecretKey();
      receiver = {
        id: pubky,
        noise_secret: noiseSecret,
        noise_public_key: wasmModule.noisePublicKeyFromSecret(noiseSecret),
        receiver_path: PAYKIT_MESSAGING_RECEIVER_PATH,
        marker_published: false,
        created_at: now,
        updated_at: now,
      };
      await LocalMessagingService.upsertReceiver(receiver);
    }
    // Republishing is idempotent and heals a marker removed elsewhere. A
    // messaging-only receiver advertises exactly the Encrypted Link
    // capability (`privatePayments`) and none of the payment capabilities.
    await wasmModule.publishReceiverMarker(
      session,
      receiver.receiver_path,
      receiver.noise_public_key,
      true,
      false,
      false,
      false,
    );
    await LocalMessagingService.upsertReceiver({ ...receiver, marker_published: true, updated_at: Date.now() });
    return { pubky, receiverPath: receiver.receiver_path, noisePublicKey: receiver.noise_public_key };
  }

  private static async getCounterpartyMarkerWith(
    wasmModule: PaykitWasmModule,
    counterpartyPubky: string,
  ): Promise<CounterpartyMessagingMarker | null> {
    const marker = (await wasmModule.getReceiverMarker(
      this.getClient(wasmModule),
      counterpartyPubky,
      PAYKIT_MESSAGING_RECEIVER_PATH,
    )) as { receiverPath: string; noisePublicKey: string } | undefined;
    return marker ? { receiverPath: marker.receiverPath, noisePublicKey: marker.noisePublicKey } : null;
  }

  private static requireSession(ownerPubky: string): ActiveSession {
    if (!this.session || this.session.pubky !== ownerPubky) {
      throw Err.auth(AuthErrorCode.SESSION_EXPIRED, 'No active messaging session. Reconnect with your signer.', {
        service: ErrorService.Paykit,
        operation: 'requireSession',
      });
    }
    return this.session;
  }

  private static async requireReceiver(ownerPubky: string) {
    const receiver = await LocalMessagingService.getReceiver(ownerPubky);
    if (!receiver) {
      throw Err.client(ClientErrorCode.BAD_REQUEST, 'Messaging is not provisioned on this device.', {
        service: ErrorService.Paykit,
        operation: 'requireReceiver',
      });
    }
    return receiver;
  }

  private static setSession(session: ActiveSession): void {
    if (this.session && this.session.pubky !== session.pubky) this.clearSession();
    else if (this.session) closeQuietly(() => this.session?.handle.free());
    this.session = session;
  }

  private static getClient(wasmModule: PaykitWasmModule): PubkyClient {
    this.client ??= getTestnet() ? wasmModule.PubkyClient.testnet() : new wasmModule.PubkyClient();
    return this.client;
  }

  /**
   * Serializes operations per counterparty: the binding rejects overlapping
   * operations on one link, and interleaved persistence would break the
   * messages-before-snapshot ordering.
   */
  private static async withQueue<T>(counterpartyPubky: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(counterpartyPubky) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    this.queues.set(
      counterpartyPubky,
      next.catch(() => undefined),
    );
    return await next;
  }

  private static linkKey(ownerPubky: string, counterpartyPubky: string): string {
    return `${ownerPubky}:${counterpartyPubky}`;
  }

  private static assertDurableMode(operation: string): void {
    if (!isDurableCommerceMode(getCommerceAdapterMode())) {
      throw Err.client(ClientErrorCode.BAD_REQUEST, 'Encrypted marketplace messaging is disabled in this mode.', {
        service: ErrorService.Paykit,
        operation,
      });
    }
  }
}

function closeQuietly(dispose: () => void): void {
  try {
    dispose();
  } catch (error) {
    if (isAppError(error)) throw error;
    // wasm handles throw if already consumed/freed; that is fine on teardown.
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
