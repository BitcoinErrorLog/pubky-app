import { z } from 'zod';
import { CommerceApplication } from '@/application/commerce/commerce';
import {
  FirstContactApplication,
  type MessagingMutesState,
  type MuteChangeResult,
} from '@/application/messaging/first-contact';
import {
  MESSAGING_SYNC_MAX_COUNTERPARTIES,
  MessagingApplication,
  type MessagingThreadState,
} from '@/application/messaging/messaging';
import { UserStreamApplication } from '@/application/stream/users/users';
import { UserApplication } from '@/application/user/user';
import { getCommerceAdapterMode, isDurableCommerceMode } from '@/config/commerce';
import { NEXUS_USER_IDS_MAX_LIMIT } from '@/config/nexus';
import { parseConversationAggregateId } from '@/libs/commerce/messaging-contracts';
import { MESSAGING_COPY, messagingReportText } from '@/libs/commerce/messaging-copy';
import {
  buildMarketplaceConversationAggregateId,
  buildMarketplaceListingAggregateId,
} from '@/libs/commerce/transaction-commands';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { buildDmConversationId, parseDmConversationId } from '@/libs/messaging/dm-contracts';
import type { MessagingPolicy } from '@/libs/messaging/intake-gate';
import type { Pubky } from '@/models/models.types';
import { buildUserCompositeId } from '@/models/stream/user/userStream.helper';
import { CommerceRecordNormalizer } from '@/pipes/commerce/commerce.normalizer';
import { FollowNormalizer } from '@/pipes/follow/follow.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useMessagingStore } from '@/stores/messaging/messaging.store';

/**
 * Controller for end-to-end-encrypted messaging: marketplace listing
 * conversations AND general direct messages over the same per-counterparty
 * Encrypted Links (the marketplace sandbox's plaintext transport stays on
 * `CommerceController`). Manages the messaging store — the application layer
 * never touches stores.
 */
export class MessagingController {
  private constructor() {}

  /**
   * Starts the "enable encrypted messaging" Ring flow. On approval the public
   * fact (the enabled pubky, never the session handle) mirrors into the
   * messaging store so dependent surfaces refetch. Flows are single-use;
   * retries must call this again.
   */
  static async beginMessagingEnable() {
    const ownerPubky = this.getCurrentUserPubky();
    const flow = await MessagingApplication.beginEnableFlow(ownerPubky);
    return {
      authorizationUrl: flow.authorizationUrl,
      awaitEnabled: async () => {
        const enabled = await flow.awaitEnabled();
        useMessagingStore.getState().setMessagingEnabled(enabled.pubky);
        return enabled;
      },
      cancel: flow.cancel,
    };
  }

  static async getMessagingStatus() {
    return await MessagingApplication.getStatus(this.getCurrentUserPubky());
  }

  /** Sign-out teardown: drops the session, link handles, and the store fact. */
  static clearMessagingSession(): void {
    MessagingApplication.clearMessagingSession();
    useMessagingStore.getState().clearMessagingEnabled();
  }

  static async isCounterpartyEnrolled(counterpartyPubky: unknown): Promise<boolean> {
    return await MessagingApplication.isCounterpartyEnrolled(CommerceRecordNormalizer.pubky(counterpartyPubky));
  }

  /**
   * Opens the encrypted conversation for a listing between the signed-in user
   * and a counterparty. The conversation id is the same aggregate reference
   * the sandbox transport uses (`conversation:{seller}_{buyer}_{listingId}`).
   * Nothing is opened with someone this account muted, and nothing at all
   * while the mute list cannot be confirmed (`paused`).
   */
  static async openConversation(
    sellerPubky: unknown,
    buyerPubky: unknown,
    listingId: unknown,
  ): Promise<{ state: MessagingThreadState; conversationId: string; counterpartyPubky: string }> {
    const { ownerPubky, counterpartyPubky, conversationId, listingRef } = this.resolveConversation(
      sellerPubky,
      buyerPubky,
      listingId,
    );
    const confirmed = await this.confirmPolicy(ownerPubky, counterpartyPubky);
    if (!confirmed.policy) return { state: confirmed.state, conversationId, counterpartyPubky };
    const state = await MessagingApplication.openConversation(
      ownerPubky,
      counterpartyPubky,
      conversationId,
      listingRef,
      confirmed.policy,
    );
    return { state, conversationId, counterpartyPubky };
  }

  static async pollConversation(sellerPubky: unknown, buyerPubky: unknown, listingId: unknown) {
    const { ownerPubky, counterpartyPubky } = this.resolveConversation(sellerPubky, buyerPubky, listingId);
    return await this.pollCounterparty(ownerPubky, counterpartyPubky);
  }

  static async sendMessage(sellerPubky: unknown, buyerPubky: unknown, listingId: unknown, body: string) {
    const { ownerPubky, counterpartyPubky, conversationId, listingRef } = this.resolveConversation(
      sellerPubky,
      buyerPubky,
      listingId,
    );
    const policy = await this.requirePolicy(ownerPubky, counterpartyPubky, 'sendMessage');
    const message = await MessagingApplication.sendMessage(
      ownerPubky,
      counterpartyPubky,
      { conversationId, listingRef, body },
      policy,
    );
    await FirstContactApplication.accept(ownerPubky, counterpartyPubky);
    return message;
  }

  /**
   * Queue-aware listing-chat send: delivers directly when the link is ready,
   * otherwise queues the message device-locally (validated against the same
   * byte ceiling) for automatic delivery. The result distinguishes the two —
   * the UI never labels a queued message sent.
   *
   * A buyer's first message in a listing thread first does the first-contact
   * work the seller needs to find them: it follows the seller and publishes
   * a conversation request for the listing. The first message to a new
   * person is refused, before anything is followed or written, once the
   * buyer reached the limit of new people per hour. `firstContact` reports
   * what happened so the dialog can tell the buyer when the seller may not
   * see the message yet. Writing to someone accepts them.
   */
  static async sendOrQueueMessage(sellerPubky: unknown, buyerPubky: unknown, listingId: unknown, body: string) {
    const resolved = this.resolveConversation(sellerPubky, buyerPubky, listingId);
    const { ownerPubky, counterpartyPubky, conversationId, listingRef } = resolved;
    const policy = await this.requirePolicy(ownerPubky, counterpartyPubky, 'sendOrQueueMessage');
    // A message that cannot be sent must not follow anyone or publish anything.
    MessagingApplication.assertSendableChat(ownerPubky, counterpartyPubky, { conversationId, listingRef, body });
    const firstContact =
      ownerPubky === resolved.buyerPubky
        ? await this.runFirstContact(ownerPubky, counterpartyPubky, resolved.listingId)
        : null;
    const outcome = await MessagingApplication.sendOrQueueMessage(
      ownerPubky,
      counterpartyPubky,
      { conversationId, listingRef, body },
      policy,
    );
    await FirstContactApplication.accept(ownerPubky, counterpartyPubky);
    return { ...outcome, firstContact };
  }

  /**
   * Whether the buyer's next send in this listing thread will follow the
   * seller, so the dialog can say so before Send. `false` when the answer is
   * unknown: the send still follows, and reports it.
   */
  static async willFollowOnSend(sellerPubky: unknown, buyerPubky: unknown, listingId: unknown): Promise<boolean> {
    const resolved = this.resolveConversation(sellerPubky, buyerPubky, listingId);
    if (resolved.ownerPubky !== resolved.buyerPubky) return false;
    if (FirstContactApplication.isOrderCounterparty(resolved.ownerPubky, resolved.counterpartyPubky)) return false;
    const preparation = await FirstContactApplication.prepareFirstContact(
      resolved.ownerPubky,
      resolved.counterpartyPubky,
      resolved.listingId,
    );
    if (preparation.kind !== 'ready' || !preparation.firstMessage) return false;
    try {
      return !(await FirstContactApplication.isFollowing(resolved.ownerPubky, resolved.counterpartyPubky));
    } catch {
      return false;
    }
  }

  private static async runFirstContact(buyerPubky: string, sellerPubky: string, listingId: string) {
    const preparation = await FirstContactApplication.prepareFirstContact(buyerPubky, sellerPubky, listingId);
    if (preparation.kind === 'limited') {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, MESSAGING_COPY.firstContactLimited, {
        service: ErrorService.Local,
        operation: 'sendOrQueueMessage',
        context: { reason: 'first_contact_limited' },
      });
    }
    if (!preparation.firstMessage) return null;
    if (FirstContactApplication.isOrderCounterparty(buyerPubky, sellerPubky)) return null;
    const followed = await this.followForFirstContact(buyerPubky, sellerPubky);
    const request = await FirstContactApplication.writeConversationRequest(buyerPubky, sellerPubky, listingId);
    if (preparation.newCounterparty) {
      await FirstContactApplication.recordFirstContact(buyerPubky, sellerPubky, listingId);
    }
    return { followed, request };
  }

  /** Follows the seller unless the buyer already does. Never throws. */
  private static async followForFirstContact(
    buyerPubky: string,
    sellerPubky: string,
  ): Promise<'already' | 'followed' | 'failed'> {
    try {
      if (await FirstContactApplication.isFollowing(buyerPubky, sellerPubky)) return 'already';
      const { meta, follow } = FollowNormalizer.to({ follower: buyerPubky as Pubky, followee: sellerPubky as Pubky });
      await UserApplication.commitFollow({
        eventType: HttpMethod.PUT,
        followUrl: meta.url,
        followJson: follow.toJson(),
        follower: buyerPubky as Pubky,
        followee: sellerPubky as Pubky,
        activeStreamId: null,
      });
      return 'followed';
    } catch {
      Logger.warn('Could not follow the seller for a first message', { reason: 'first_contact_follow_failed' });
      return 'failed';
    }
  }

  /** Opens (or resumes) the general DM conversation with a counterparty. */
  static async openDmConversation(
    counterpartyPubky: unknown,
  ): Promise<{ state: MessagingThreadState; counterpartyPubky: string }> {
    const ownerPubky = this.getCurrentUserPubky();
    const counterparty = CommerceRecordNormalizer.pubky(counterpartyPubky);
    const confirmed = await this.confirmPolicy(ownerPubky, counterparty);
    if (!confirmed.policy) return { state: confirmed.state, counterpartyPubky: counterparty };
    const state = await MessagingApplication.openDmConversation(ownerPubky, counterparty, confirmed.policy);
    return { state, counterpartyPubky: counterparty };
  }

  /** One poll step for the DM surface: advance handshake + receive on the shared link. */
  static async pollDmConversation(counterpartyPubky: unknown) {
    const ownerPubky = this.getCurrentUserPubky();
    return await this.pollCounterparty(ownerPubky, CommerceRecordNormalizer.pubky(counterpartyPubky));
  }

  static async sendDmMessage(counterpartyPubky: unknown, body: string) {
    const ownerPubky = this.getCurrentUserPubky();
    const counterparty = CommerceRecordNormalizer.pubky(counterpartyPubky);
    const policy = await this.requirePolicy(ownerPubky, counterparty, 'sendDmMessage');
    const message = await MessagingApplication.sendDmMessage(ownerPubky, counterparty, body, policy);
    await FirstContactApplication.accept(ownerPubky, counterparty);
    return message;
  }

  /** Queue-aware DM send — same contract as {@link sendOrQueueMessage}, without first-contact work. */
  static async sendOrQueueDmMessage(counterpartyPubky: unknown, body: string) {
    const ownerPubky = this.getCurrentUserPubky();
    const counterparty = CommerceRecordNormalizer.pubky(counterpartyPubky);
    const policy = await this.requirePolicy(ownerPubky, counterparty, 'sendOrQueueDmMessage');
    const outcome = await MessagingApplication.sendOrQueueDmMessage(ownerPubky, counterparty, body, policy);
    await FirstContactApplication.accept(ownerPubky, counterparty);
    return outcome;
  }

  /**
   * One poll step with one counterparty, on a fresh read of the mute list.
   * A muted person is not contacted at all, and while the list cannot be
   * confirmed nobody is: no handshake step, queued send or receive runs.
   */
  private static async pollCounterparty(
    ownerPubky: string,
    counterpartyPubky: string,
  ): Promise<{
    state: MessagingThreadState;
    received: Awaited<ReturnType<typeof MessagingApplication.pollConversation>>['received'];
    flushed: number;
    rateLimited: number;
  }> {
    const confirmed = await this.confirmPolicy(ownerPubky, counterpartyPubky);
    if (!confirmed.policy) return { state: confirmed.state, received: [], flushed: 0, rateLimited: 0 };
    const result = await MessagingApplication.pollConversation(ownerPubky, counterpartyPubky, confirmed.policy);
    return { ...result, rateLimited: FirstContactApplication.takeRateLimitedCount(ownerPubky) };
  }

  // --- mutes, requests, report -------------------------------------------

  /** The signed-in account's mute list, read from private storage. */
  static async getMutes(): Promise<MessagingMutesState> {
    return await FirstContactApplication.loadMutes(this.getCurrentUserPubky());
  }

  /** Mutes or unmutes a person, then refreshes the unread fact. */
  static async setCounterpartyMuted(counterpartyPubky: unknown, muted: boolean): Promise<MuteChangeResult> {
    const ownerPubky = this.getCurrentUserPubky();
    const state = await FirstContactApplication.setMuted(
      ownerPubky,
      CommerceRecordNormalizer.pubky(counterpartyPubky),
      muted,
    );
    await this.refreshUnreadCount();
    return state;
  }

  /** Moves a person's Requests into the inbox. */
  static async acceptRequest(counterpartyPubky: unknown): Promise<void> {
    await FirstContactApplication.accept(this.getCurrentUserPubky(), CommerceRecordNormalizer.pubky(counterpartyPubky));
    await this.refreshUnreadCount();
  }

  /**
   * The text "Report" copies for one of the account's conversations: the
   * conversation id and the other account. Only ever given to the clipboard.
   */
  static async getReportDetails(conversationId: unknown): Promise<string> {
    const ownerPubky = this.getCurrentUserPubky();
    const id = this.normalizeConversationId(conversationId);
    const dm = parseDmConversationId(id);
    const listing = parseConversationAggregateId(id);
    const counterpartyPubky = dm
      ? dm.counterpartyPubky
      : listing && (listing.sellerPubky === ownerPubky || listing.buyerPubky === ownerPubky)
        ? listing.sellerPubky === ownerPubky
          ? listing.buyerPubky
          : listing.sellerPubky
        : null;
    if (!counterpartyPubky || counterpartyPubky === ownerPubky) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'This conversation is not on this account.', {
        service: ErrorService.Local,
        operation: 'getReportDetails',
      });
    }
    return messagingReportText({
      conversationId: dm ? buildDmConversationId(counterpartyPubky) : id,
      counterpartyPubky,
    });
  }

  /**
   * The confirmed policy for one operation with one person, from a fresh
   * read of the mute list, or the state to show instead: `paused` while the
   * list cannot be confirmed, `muted` for a muted person.
   */
  private static async confirmPolicy(
    ownerPubky: string,
    counterpartyPubky: string,
  ): Promise<{ policy: MessagingPolicy; state: null } | { policy: null; state: MessagingThreadState }> {
    const mutes = await FirstContactApplication.loadMutes(ownerPubky);
    const policy = FirstContactApplication.policyFor(ownerPubky, mutes);
    if (!policy) {
      const reason = mutes.kind === 'needs_approval' || mutes.kind === 'needs_reauth' ? mutes.kind : 'error';
      return { policy: null, state: { status: 'paused', reason } };
    }
    if (policy.isMuted(counterpartyPubky)) return { policy: null, state: { status: 'muted' } };
    return { policy, state: null };
  }

  /** {@link confirmPolicy} for a send: refuses with the reason instead of returning a state. */
  private static async requirePolicy(
    ownerPubky: string,
    counterpartyPubky: string,
    operation: string,
  ): Promise<MessagingPolicy> {
    const confirmed = await this.confirmPolicy(ownerPubky, counterpartyPubky);
    if (confirmed.policy) return confirmed.policy;
    const muted = confirmed.state.status === 'muted';
    throw Err.validation(
      ValidationErrorCode.INVALID_INPUT,
      muted ? MESSAGING_COPY.mutedSendRefused : MESSAGING_COPY.sendPausedForMutes,
      { service: ErrorService.Local, operation, context: { reason: muted ? 'muted' : 'mutes_unconfirmed' } },
    );
  }

  /** Reads the mute list once if this session has not tried yet, so display paths know whom to hide. */
  private static async ensureMutesRead(ownerPubky: string): Promise<void> {
    if (FirstContactApplication.getMuteReadState(ownerPubky) === 'none') {
      await FirstContactApplication.loadMutes(ownerPubky);
    }
  }

  static async getConversationMessages(conversationId: unknown) {
    return await MessagingApplication.getConversationMessages(
      this.getCurrentUserPubky(),
      this.normalizeConversationId(conversationId),
    );
  }

  /** Device-locally queued (not yet sent) messages of one conversation, oldest first. */
  static async getQueuedConversationMessages(conversationId: unknown) {
    return await MessagingApplication.getQueuedMessagesForConversation(
      this.getCurrentUserPubky(),
      this.normalizeConversationId(conversationId),
    );
  }

  /** Deletes one of the signed-in user's queued messages while it is still queued. */
  static async cancelQueuedMessage(id: unknown): Promise<void> {
    await MessagingApplication.cancelQueuedMessage(this.getCurrentUserPubky(), this.normalizeOutboxId(id));
  }

  /**
   * The account's conversations; threads with people it is known to have
   * muted are left out, even while the list cannot be read right now.
   */
  static async getConversations() {
    const ownerPubky = this.getCurrentUserPubky();
    await this.ensureMutesRead(ownerPubky);
    const hidden = FirstContactApplication.getHiddenPubkys(ownerPubky);
    const conversations = await MessagingApplication.getConversations(ownerPubky);
    return conversations.filter((conversation) => !hidden.has(conversation.counterparty_pubky));
  }

  /**
   * Moves a conversation's device-local read checkpoint to now and refreshes
   * the unread fact in the store. Called by conversation surfaces while they
   * are actually showing messages.
   */
  static async markConversationRead(conversationId: unknown): Promise<void> {
    const ownerPubky = this.getCurrentUserPubky();
    await MessagingApplication.markConversationRead(ownerPubky, this.normalizeConversationId(conversationId));
    await this.refreshUnreadCount();
  }

  /**
   * Recomputes the device-local unread conversation count and mirrors it into
   * the messaging store (the header/footer badges subscribe there). Honest by
   * construction: only messages already persisted on this device count.
   * Requests and muted people never count, and nothing counts while the
   * mute list cannot be confirmed.
   */
  static async refreshUnreadCount(): Promise<number> {
    const ownerPubky = useAuthStore.getState().currentUserPubky;
    if (!ownerPubky) {
      useMessagingStore.getState().setUnreadConversations(0);
      return 0;
    }
    // The badge reads the list only if this session never has; after that
    // it follows the last read, which every sync and poll refreshes.
    await this.ensureMutesRead(ownerPubky);
    const count =
      FirstContactApplication.getMuteReadState(ownerPubky) === 'confirmed'
        ? await MessagingApplication.getUnreadConversationCount(
            ownerPubky,
            FirstContactApplication.getHiddenPubkys(ownerPubky),
          )
        : 0;
    useMessagingStore.getState().setUnreadConversations(count);
    return count;
  }

  /**
   * One bounded inbox sync pass. The responder can only answer handshakes
   * from counterparties it can NAME (the binding cannot enumerate inbound
   * handshakes from strangers), so the naming set is assembled here:
   *
   * 1. Everyone with existing local messaging state (added inside the
   *    application layer, most recent first).
   * 2. Marketplace order/offer participants — only when a durable commerce
   *    mode is configured; general DMs never depend on the commerce adapter.
   * 3. The user's follows and followers (Nexus-fed user streams). A buyer
   *    who follows this seller and published a conversation request is
   *    probed first, and the request adds the listing thread right away.
   *
   * People this account does not follow and shares no order or offer with
   * land in Requests. Muted people are never probed. When the mute list
   * cannot be confirmed, nobody is contacted at all (no request discovery,
   * probe, handshake step, queued send or receive), and `mutes` says why.
   *
   * Any source failing to read degrades to the remaining sources instead of
   * failing the sync. Ends by refreshing the device-local unread fact.
   */
  static async syncInbox(): Promise<{ mutes: MessagingMutesState['kind']; rateLimited: number }> {
    const ownerPubky = this.getCurrentUserPubky();
    const mutes = await FirstContactApplication.loadMutes(ownerPubky);
    const policy = FirstContactApplication.policyFor(ownerPubky, mutes);
    if (!policy) {
      await this.refreshUnreadCount();
      return { mutes: mutes.kind, rateLimited: 0 };
    }
    const muted = mutes.kind === 'ready' ? mutes.muted : new Set<string>();
    const orderCounterparties = isDurableCommerceMode(getCommerceAdapterMode())
      ? await this.getMarketplaceCounterpartyCandidates(ownerPubky)
      : [];
    const { following, followers } = await this.getFollowGraphCandidates(ownerPubky);
    FirstContactApplication.setKnownContacts(ownerPubky, {
      following,
      orderCounterparties: orderCounterparties.filter((pubky) => pubky !== ownerPubky),
    });
    const requesters = await FirstContactApplication.discoverRequests(ownerPubky, followers, muted);
    const candidates = new Set([...orderCounterparties, ...following, ...followers]);
    candidates.delete(ownerPubky);
    await MessagingApplication.syncCounterparties(ownerPubky, [...candidates], {
      priorityPubkys: requesters,
      policy,
    });
    await FirstContactApplication.promoteKnownRequests(ownerPubky);
    await this.refreshUnreadCount();
    return { mutes: mutes.kind, rateLimited: FirstContactApplication.takeRateLimitedCount(ownerPubky) };
  }

  /** Buyer/seller pubkys from the user's durable orders and offers; failures degrade to empty. */
  private static async getMarketplaceCounterpartyCandidates(ownerPubky: string): Promise<string[]> {
    const candidates = new Set<string>();
    const [orders, offers] = await Promise.allSettled([
      CommerceApplication.getMarketplaceOrders(ownerPubky),
      CommerceApplication.getMarketplaceOffers(ownerPubky),
    ]);
    if (orders.status === 'fulfilled') {
      for (const order of orders.value) {
        candidates.add(order.buyerPubky);
        candidates.add(order.sellerPubky);
      }
    } else {
      Logger.warn('Inbox sync could not read marketplace orders for counterparty candidates', {
        error: orders.reason,
      });
    }
    if (offers.status === 'fulfilled') {
      for (const offer of offers.value) {
        candidates.add(offer.buyerPubky);
        candidates.add(offer.sellerPubky);
      }
    } else {
      Logger.warn('Inbox sync could not read marketplace offers for counterparty candidates', {
        error: offers.reason,
      });
    }
    return [...candidates];
  }

  /**
   * The user's follows and followers from the app's existing Nexus-fed user
   * streams (cache-first, one bounded page each — the sync pass itself is
   * capped at {@link MESSAGING_SYNC_MAX_COUNTERPARTIES} probes, so deeper
   * pagination would buy nothing). Failures degrade to empty.
   */
  private static async getFollowGraphCandidates(
    ownerPubky: string,
  ): Promise<{ following: string[]; followers: string[] }> {
    const reaches = ['following', 'followers'] as const;
    const slices = await Promise.allSettled(
      reaches.map((reach) =>
        UserStreamApplication.getOrFetchStreamSlice({
          streamId: buildUserCompositeId({ userId: ownerPubky as Pubky, reach }),
          skip: 0,
          // The user-ids stream rejects limits above its own cap (20 on the
          // deployed Nexus) with a 400, which silently degraded this whole
          // source to empty and made follower-initiated messages undiscoverable.
          limit: Math.min(MESSAGING_SYNC_MAX_COUNTERPARTIES, NEXUS_USER_IDS_MAX_LIMIT),
          viewerId: ownerPubky as Pubky,
          allowPartialCache: true,
        }),
      ),
    );
    const graph = { following: [] as string[], followers: [] as string[] };
    slices.forEach((slice, index) => {
      if (slice.status === 'fulfilled') {
        graph[reaches[index]] = [...new Set(slice.value.nextPageIds)].filter((pubky) => pubky !== ownerPubky);
      } else {
        Logger.warn('Inbox sync could not read the follow graph for counterparty candidates', {
          error: slice.reason,
          context: { reach: reaches[index] },
        });
      }
    });
    return graph;
  }

  /**
   * A conversation id is a LOCAL Dexie key, not a path-safe commerce entity
   * id (both shapes contain a colon): the marketplace aggregate
   * `conversation:{seller}_{buyer}_{listingId}` or the DM key
   * `dm:{counterpartyPubky}`. Anything else is rejected.
   */
  private static normalizeConversationId(input: unknown): string {
    if (typeof input === 'string' && (parseConversationAggregateId(input) || parseDmConversationId(input))) {
      return input;
    }
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid messaging conversation id.', {
      service: ErrorService.Local,
      operation: 'normalizeConversationId',
    });
  }

  /** Outbox row ids are queue-time UUIDs (see the outbox schema). */
  private static normalizeOutboxId(input: unknown): string {
    if (typeof input === 'string' && z.uuid().safeParse(input).success) return input;
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid queued message id.', {
      service: ErrorService.Local,
      operation: 'normalizeOutboxId',
    });
  }

  private static resolveConversation(sellerPubky: unknown, buyerPubky: unknown, listingId: unknown) {
    const seller = CommerceRecordNormalizer.pubky(sellerPubky);
    const buyer = CommerceRecordNormalizer.pubky(buyerPubky);
    const listing = CommerceRecordNormalizer.entityId(listingId);
    const ownerPubky = this.getCurrentUserPubky();
    if (seller === buyer || (ownerPubky !== seller && ownerPubky !== buyer)) {
      throw Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'This conversation does not belong to the signed-in account.',
        {
          service: ErrorService.Local,
          operation: 'resolveConversation',
        },
      );
    }
    const counterpartyPubky = ownerPubky === seller ? buyer : seller;
    return {
      ownerPubky,
      counterpartyPubky,
      buyerPubky: buyer,
      listingId: listing,
      conversationId: buildMarketplaceConversationAggregateId(seller, buyer, listing),
      listingRef: buildMarketplaceListingAggregateId(seller, listing),
    };
  }

  private static getCurrentUserPubky(): string {
    return useAuthStore.getState().selectCurrentUserPubky();
  }
}
