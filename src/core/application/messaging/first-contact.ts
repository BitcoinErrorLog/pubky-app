import { followUriBuilder } from 'pubky-app-specs';
import { CommercePrivKeyringApplication } from '@/application/commerce/priv-keyring';
import { getCommerceAdapterMode, isDurableCommerceMode } from '@/config/commerce';
import { privErrorSummary,type PrivKeyring } from '@/libs/commerce/priv-envelope';
import {
  buildMarketplaceConversationAggregateId,
  buildMarketplaceListingAggregateId,
} from '@/libs/commerce/transaction-commands';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { hasHttpStatus, isAppError, isNotFound } from '@/libs/error/error.utils';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import {
  buildConversationRequest,
  type ConversationOrigin,
  conversationRequestDirectoryUrl,
  conversationRequestUrl,
  isFirstContactAllowed,
  listingIdFromRequestUrl,
  parseBoundConversationRequest,
  ReceiveRateLimiter,
} from '@/libs/messaging/first-contact';
import type { MessagingIntakeGate } from '@/libs/messaging/intake-gate';
import { applyMuteChange, emptyMuteList, mutedPubkys, type MuteList, parseMuteList } from '@/libs/messaging/mute-list';
import { CommercePrivStoreService } from '@/services/homeserver/commerce/priv-store';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalMessagingService } from '@/services/local/messaging/messaging';

const MUTES_FAMILY = 'messaging_mutes';
const MUTES_ENTRY_ID = 'mutes';

/** Followers whose request directories one sync lists. */
export const FIRST_CONTACT_MAX_REQUEST_SOURCES = 20;
/** Request documents read from one buyer per sync. */
export const FIRST_CONTACT_MAX_REQUESTS_PER_BUYER = 10;

/**
 * The account's mute list as far as this device can tell.
 *
 * - `ready`: the list was read (or confirmed absent).
 * - `unavailable`: this Shop has no private storage, so muting is not
 *   offered and nobody is muted.
 * - `needs_approval` / `needs_reauth`: the list cannot be read until the user
 *   approves again (the private keys, or the homeserver session).
 * - `error`: the read failed or the stored list could not be opened.
 *
 * Only `ready` and `unavailable` let messages be received: in every other
 * state the policy cannot tell who is muted, so nothing new is stored.
 */
export type MessagingMutesState =
  | { kind: 'ready'; muted: ReadonlySet<string> }
  | { kind: 'unavailable' }
  | { kind: 'needs_approval' }
  | { kind: 'needs_reauth' }
  | { kind: 'error' };

/** Why the first message to a seller was not allowed, or what it did. */
export type FirstContactPreparation =
  | { kind: 'limited' }
  | { kind: 'ready'; firstMessage: false }
  | { kind: 'ready'; firstMessage: true; newCounterparty: boolean };

export type ConversationRequestWrite = 'written' | 'kept' | 'failed';

/**
 * Shop policy for first contact, above the message transport: who lands in
 * Requests, who is muted, the buyer's public conversation request, and the
 * limits on new people and inbound volume. It never sends, receives or
 * decrypts. The transport sees it only through {@link MessagingIntakeGate}.
 *
 * All caches are in memory, per owner, and dropped by {@link clear} at
 * sign-out.
 */
export class FirstContactApplication {
  private constructor() {}

  private static mutes = new Map<string, MuteList>();
  private static muteWrites = new Map<string, Promise<unknown>>();
  private static knownContacts = new Map<string, ReadonlySet<string>>();
  private static orderCounterparties = new Map<string, ReadonlySet<string>>();
  private static seenRequests = new Set<string>();
  private static receiveLimiter = new ReceiveRateLimiter();
  private static rateLimitedCounts = new Map<string, number>();

  // --- mutes --------------------------------------------------------------

  /**
   * Reads the mute list from `/priv`. A list read earlier in this session is
   * kept when a later read fails, so a passing network error does not stop
   * delivery; a first read that fails leaves the state unknown.
   */
  static async loadMutes(ownerPubky: string): Promise<MessagingMutesState> {
    if (!isDurableCommerceMode(getCommerceAdapterMode())) return { kind: 'unavailable' };
    const keys = await CommercePrivKeyringApplication.get(ownerPubky);
    const result =
      keys.kind === 'keys'
        ? await this.readMuteList(ownerPubky, keys.keyring)
        : ({ kind: keys.kind === 'needs_reauth' ? 'needs_approval' : 'error' } as const);
    if (result.kind === 'list') {
      this.mutes.set(ownerPubky, result.list);
      return { kind: 'ready', muted: mutedPubkys(result.list) };
    }
    const cached = this.mutes.get(ownerPubky);
    if (cached) return { kind: 'ready', muted: mutedPubkys(cached) };
    return { kind: result.kind };
  }

  /** The list this session last read or wrote, without a network call. */
  static getCachedMutes(ownerPubky: string): MessagingMutesState | null {
    if (!isDurableCommerceMode(getCommerceAdapterMode())) return { kind: 'unavailable' };
    const cached = this.mutes.get(ownerPubky);
    return cached ? { kind: 'ready', muted: mutedPubkys(cached) } : null;
  }

  /**
   * Mutes or unmutes one person: reads the stored list, applies the change,
   * writes it sealed and reads it back. A failed read writes nothing, so a
   * list that could not be opened is never replaced. Changes from one tab
   * run one after another.
   */
  static async setMuted(ownerPubky: string, counterpartyPubky: string, muted: boolean): Promise<MessagingMutesState> {
    if (!isDurableCommerceMode(getCommerceAdapterMode())) return { kind: 'unavailable' };
    if (ownerPubky === counterpartyPubky) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'You cannot mute yourself.', {
        service: ErrorService.Local,
        operation: 'setMuted',
      });
    }
    const previous = this.muteWrites.get(ownerPubky) ?? Promise.resolve();
    const run = previous.then(
      () => this.writeMuteChange(ownerPubky, counterpartyPubky, muted),
      () => this.writeMuteChange(ownerPubky, counterpartyPubky, muted),
    );
    this.muteWrites.set(
      ownerPubky,
      run.catch(() => undefined),
    );
    return await run;
  }

  private static async writeMuteChange(
    ownerPubky: string,
    counterpartyPubky: string,
    muted: boolean,
  ): Promise<MessagingMutesState> {
    const keys = await CommercePrivKeyringApplication.get(ownerPubky);
    if (keys.kind !== 'keys') return { kind: keys.kind === 'needs_reauth' ? 'needs_approval' : 'error' };
    const stored = await this.readMuteList(ownerPubky, keys.keyring);
    if (stored.kind !== 'list') return { kind: stored.kind };
    const next = applyMuteChange(stored.list, counterpartyPubky, muted, Date.now());
    try {
      await CommercePrivStoreService.write(keys.keyring, MUTES_FAMILY, MUTES_ENTRY_ID, next);
    } catch (error) {
      if (this.isPrivateAccessDenied(error)) return { kind: 'needs_reauth' };
      Logger.warn('Could not save the mute list', privErrorSummary(error));
      return { kind: 'error' };
    }
    this.mutes.set(ownerPubky, next);
    return { kind: 'ready', muted: mutedPubkys(next) };
  }

  /** The stored list (empty when absent), or why it could not be opened. */
  private static async readMuteList(
    ownerPubky: string,
    keyring: PrivKeyring,
  ): Promise<{ kind: 'list'; list: MuteList } | { kind: 'needs_reauth' | 'error' }> {
    try {
      const payload = await CommercePrivStoreService.read(keyring, MUTES_FAMILY, MUTES_ENTRY_ID);
      if (payload === null) return { kind: 'list', list: emptyMuteList(ownerPubky) };
      const list = parseMuteList(payload, ownerPubky);
      if (!list) {
        Logger.warn('The stored mute list is not valid; leaving it unchanged');
        return { kind: 'error' };
      }
      return { kind: 'list', list };
    } catch (error) {
      if (this.isPrivateAccessDenied(error)) return { kind: 'needs_reauth' };
      Logger.warn('Could not read the mute list', privErrorSummary(error));
      return { kind: 'error' };
    }
  }

  /**
   * 403 or 401 on `/priv` for a session a new approval can widen. A grant
   * session already holds the full Shop grant, so a refusal there is not
   * something the user can fix by approving again.
   */
  private static isPrivateAccessDenied(error: unknown): boolean {
    const denied = hasHttpStatus(error, HttpStatusCode.FORBIDDEN) || hasHttpStatus(error, HttpStatusCode.UNAUTHORIZED);
    return denied && !HomeserverService.isCurrentSessionGrant();
  }

  // --- intake -------------------------------------------------------------

  /**
   * The gate inbound messages pass before they are stored, or `null` when
   * the mute list is unknown (nothing new is received then). Muted people
   * are refused, each person gets at most the receive cap per minute on this
   * device's clock, and a message that starts a thread with someone this
   * account does not know lands in Requests.
   */
  static intakeGate(ownerPubky: string, mutes: MessagingMutesState): MessagingIntakeGate | null {
    if (mutes.kind !== 'ready' && mutes.kind !== 'unavailable') return null;
    const muted = mutes.kind === 'ready' ? mutes.muted : new Set<string>();
    return {
      admit: async ({ counterpartyPubky }) => {
        if (muted.has(counterpartyPubky)) return { store: false, reason: 'muted' };
        if (!this.receiveLimiter.admit(`${ownerPubky}:${counterpartyPubky}`, Date.now())) {
          this.rateLimitedCounts.set(ownerPubky, (this.rateLimitedCounts.get(ownerPubky) ?? 0) + 1);
          return { store: false, reason: 'rate_limited' };
        }
        return { store: true, origin: await this.originFor(ownerPubky, counterpartyPubky) };
      },
    };
  }

  /** How many messages the receive cap refused since the last call, then resets. */
  static takeRateLimitedCount(ownerPubky: string): number {
    const count = this.rateLimitedCounts.get(ownerPubky) ?? 0;
    this.rateLimitedCounts.delete(ownerPubky);
    return count;
  }

  // --- Requests -----------------------------------------------------------

  /**
   * The people this account knows without having talked to them: the people
   * it follows and its order and offer counterparties. Replaced on every
   * inbox sync.
   */
  static setKnownContacts(
    ownerPubky: string,
    contacts: { following: Iterable<string>; orderCounterparties: Iterable<string> },
  ): void {
    const orderCounterparties = new Set(contacts.orderCounterparties);
    this.orderCounterparties.set(ownerPubky, orderCounterparties);
    this.knownContacts.set(ownerPubky, new Set([...contacts.following, ...orderCounterparties]));
  }

  /**
   * Whether the person shares an order or offer with this account. Both
   * sides of an order already find each other, so a first message about it
   * needs no follow or request.
   */
  static isOrderCounterparty(ownerPubky: string, counterpartyPubky: string): boolean {
    return this.orderCounterparties.get(ownerPubky)?.has(counterpartyPubky) ?? false;
  }

  /**
   * `known` when the account follows the person, shares an order or offer
   * with them, has an inbox thread with them already, or has written to
   * them; otherwise `request`.
   */
  static async originFor(ownerPubky: string, counterpartyPubky: string): Promise<ConversationOrigin> {
    if (this.knownContacts.get(ownerPubky)?.has(counterpartyPubky)) return 'known';
    const conversations = await LocalMessagingService.getConversationsByOwner(ownerPubky);
    if (
      conversations.some(
        (conversation) => conversation.counterparty_pubky === counterpartyPubky && conversation.origin !== 'request',
      )
    ) {
      return 'known';
    }
    return (await LocalMessagingService.hasSentTo(ownerPubky, counterpartyPubky)) ? 'known' : 'request';
  }

  /** Moves Requests from people who have since become known into the inbox. */
  static async promoteKnownRequests(ownerPubky: string): Promise<void> {
    const known = this.knownContacts.get(ownerPubky) ?? new Set<string>();
    const promoted = new Set<string>();
    for (const conversation of await LocalMessagingService.getConversationsByOwner(ownerPubky)) {
      if (conversation.origin !== 'request' || promoted.has(conversation.counterparty_pubky)) continue;
      const pubky = conversation.counterparty_pubky;
      if (known.has(pubky) || (await LocalMessagingService.hasSentTo(ownerPubky, pubky))) {
        promoted.add(pubky);
        await LocalMessagingService.markCounterpartyKnown(ownerPubky, pubky);
      }
    }
  }

  /** Accepts a person: every thread with them moves from Requests to the inbox. */
  static async accept(ownerPubky: string, counterpartyPubky: string): Promise<void> {
    await LocalMessagingService.markCounterpartyKnown(ownerPubky, counterpartyPubky);
  }

  /**
   * Seller side: lists the conversation requests each follower wrote for
   * this seller and adds one listing thread per valid request. Only the
   * request's path is trusted (the buyer's own `/pub`), and every JSON field
   * must repeat it. Returns the buyers with at least one valid request, so
   * the sync probes them first. A buyer whose directory cannot be read is
   * skipped until the next pass.
   */
  static async discoverRequests(
    sellerPubky: string,
    followerPubkys: readonly string[],
    muted: ReadonlySet<string>,
  ): Promise<string[]> {
    const requesters: string[] = [];
    for (const buyerPubky of followerPubkys.slice(0, FIRST_CONTACT_MAX_REQUEST_SOURCES)) {
      if (buyerPubky === sellerPubky || muted.has(buyerPubky)) continue;
      let urls: string[];
      const directoryUrl = conversationRequestDirectoryUrl(buyerPubky, sellerPubky);
      try {
        urls = await HomeserverService.list({
          baseDirectory: directoryUrl,
          limit: FIRST_CONTACT_MAX_REQUESTS_PER_BUYER,
        });
      } catch (error) {
        if (!(isAppError(error) && isNotFound(error))) {
          Logger.warn('Could not list a follower’s conversation requests', { reason: 'request_list_failed' });
        }
        continue;
      }
      let found = false;
      for (const url of urls) {
        const listingId = listingIdFromRequestUrl(url, directoryUrl);
        if (!listingId) continue;
        if (await this.addRequestThread(sellerPubky, buyerPubky, listingId)) found = true;
      }
      if (found) requesters.push(buyerPubky);
    }
    return requesters;
  }

  private static async addRequestThread(sellerPubky: string, buyerPubky: string, listingId: string): Promise<boolean> {
    const seenKey = `${sellerPubky}:${buyerPubky}:${listingId}`;
    if (!this.seenRequests.has(seenKey)) {
      let raw: unknown;
      try {
        raw = await HomeserverService.request<unknown>({
          method: HttpMethod.GET,
          url: conversationRequestUrl(buyerPubky, sellerPubky, listingId),
        });
      } catch {
        return false;
      }
      if (!parseBoundConversationRequest(raw, { documentOwner: buyerPubky, sellerPubky, listingId })) return false;
      this.seenRequests.add(seenKey);
    }
    const conversationId = buildMarketplaceConversationAggregateId(sellerPubky, buyerPubky, listingId);
    if (await LocalMessagingService.getConversation(sellerPubky, conversationId)) return true;
    await LocalMessagingService.touchConversation({
      owner_id: sellerPubky,
      conversation_id: conversationId,
      kind: 'listing',
      listing_ref: buildMarketplaceListingAggregateId(sellerPubky, listingId),
      counterparty_pubky: buyerPubky,
      last_message_at: null,
      updated_at: Date.now(),
      origin: await this.originFor(sellerPubky, buyerPubky),
    });
    return true;
  }

  // --- the buyer's first message ------------------------------------------

  /**
   * Decides whether the buyer may send in this listing thread now. Only the
   * first message of a thread does first-contact work; the first message to
   * a new person also counts against the limit of new people per hour,
   * which refuses before anything is followed, written or sent.
   */
  static async prepareFirstContact(
    buyerPubky: string,
    sellerPubky: string,
    listingId: string,
  ): Promise<FirstContactPreparation> {
    const conversationId = buildMarketplaceConversationAggregateId(sellerPubky, buyerPubky, listingId);
    const history = await LocalMessagingService.getMessages(buyerPubky, conversationId);
    const queued = await LocalMessagingService.getQueuedMessages(buyerPubky, sellerPubky);
    if (
      history.some((message) => message.direction === 'sent') ||
      queued.some((row) => row.conversation_id === conversationId)
    ) {
      return { kind: 'ready', firstMessage: false };
    }
    const newCounterparty = !(await LocalMessagingService.hasHistoryWith(buyerPubky, sellerPubky));
    if (newCounterparty) {
      const firstContacts = await LocalMessagingService.getFirstContacts(buyerPubky);
      if (!isFirstContactAllowed(firstContacts, sellerPubky, Date.now())) return { kind: 'limited' };
    }
    return { kind: 'ready', firstMessage: true, newCounterparty };
  }

  /** Dates the first message to a new person, for the limit on new people per hour. */
  static async recordFirstContact(buyerPubky: string, sellerPubky: string, listingId: string): Promise<void> {
    const conversationId = buildMarketplaceConversationAggregateId(sellerPubky, buyerPubky, listingId);
    await LocalMessagingService.touchConversation({
      owner_id: buyerPubky,
      conversation_id: conversationId,
      kind: 'listing',
      listing_ref: buildMarketplaceListingAggregateId(sellerPubky, listingId),
      counterparty_pubky: sellerPubky,
      last_message_at: null,
      updated_at: Date.now(),
      origin: 'known',
    });
    await LocalMessagingService.recordFirstContact(buyerPubky, conversationId, Date.now());
  }

  /**
   * Whether the buyer's follow of the seller is on the buyer's homeserver.
   * Throws when the answer is unknown.
   */
  static async isFollowing(followerPubky: string, followeePubky: string): Promise<boolean> {
    try {
      await HomeserverService.request({ method: HttpMethod.GET, url: followUriBuilder(followerPubky, followeePubky) });
      return true;
    } catch (error) {
      if (isAppError(error) && isNotFound(error)) return false;
      throw error;
    }
  }

  /**
   * Publishes the buyer's conversation request for one listing. Reads it
   * first: a valid request is kept as it is, a missing or invalid one is
   * written, and a failed read writes nothing.
   */
  static async writeConversationRequest(
    buyerPubky: string,
    sellerPubky: string,
    listingId: string,
  ): Promise<ConversationRequestWrite> {
    const url = conversationRequestUrl(buyerPubky, sellerPubky, listingId);
    try {
      const existing = await HomeserverService.request<unknown>({ method: HttpMethod.GET, url });
      if (parseBoundConversationRequest(existing, { documentOwner: buyerPubky, sellerPubky, listingId })) {
        return 'kept';
      }
    } catch (error) {
      if (!(isAppError(error) && isNotFound(error))) {
        Logger.warn('Could not read the conversation request; nothing was written', { reason: 'request_read_failed' });
        return 'failed';
      }
    }
    try {
      await HomeserverService.request({
        method: HttpMethod.PUT,
        url,
        bodyJson: buildConversationRequest({ sellerPubky, buyerPubky, listingId, createdAt: Date.now() }),
      });
      return 'written';
    } catch {
      Logger.warn('Could not publish the conversation request', { reason: 'request_write_failed' });
      return 'failed';
    }
  }

  /** Sign-out teardown: forgets every cached list, contact set and counter. */
  static clear(): void {
    this.mutes.clear();
    this.muteWrites.clear();
    this.knownContacts.clear();
    this.orderCounterparties.clear();
    this.seenRequests.clear();
    this.receiveLimiter.clear();
    this.rateLimitedCounts.clear();
  }
}
