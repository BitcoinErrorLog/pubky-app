import { CommerceApplication } from '@/application/commerce/commerce';
import { MessagingApplication } from '@/application/messaging/messaging';
import { getCommerceAdapterMode, isDurableCommerceMode } from '@/config/commerce';
import {
  buildMarketplaceConversationAggregateId,
  buildMarketplaceListingAggregateId,
} from '@/libs/commerce/transaction-commands';
import { Logger } from '@/libs/logger/logger';
import { CommerceRecordNormalizer } from '@/pipes/commerce/commerce.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useMessagingStore } from '@/stores/messaging/messaging.store';

/**
 * Controller for end-to-end-encrypted marketplace messaging (durable commerce
 * modes; the sandbox transport stays on `CommerceController`). Manages the
 * messaging store — the application layer never touches stores.
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
   */
  static async openConversation(sellerPubky: unknown, buyerPubky: unknown, listingId: unknown) {
    const { ownerPubky, counterpartyPubky, conversationId, listingRef } = this.resolveConversation(
      sellerPubky,
      buyerPubky,
      listingId,
    );
    const state = await MessagingApplication.openConversation(
      ownerPubky,
      counterpartyPubky,
      conversationId,
      listingRef,
    );
    return { state, conversationId, counterpartyPubky };
  }

  static async pollConversation(sellerPubky: unknown, buyerPubky: unknown, listingId: unknown) {
    const { ownerPubky, counterpartyPubky } = this.resolveConversation(sellerPubky, buyerPubky, listingId);
    return await MessagingApplication.pollConversation(ownerPubky, counterpartyPubky);
  }

  static async sendMessage(sellerPubky: unknown, buyerPubky: unknown, listingId: unknown, body: string) {
    const { ownerPubky, counterpartyPubky, conversationId, listingRef } = this.resolveConversation(
      sellerPubky,
      buyerPubky,
      listingId,
    );
    return await MessagingApplication.sendMessage(ownerPubky, counterpartyPubky, {
      conversationId,
      listingRef,
      body,
    });
  }

  static async getConversationMessages(conversationId: unknown) {
    return await MessagingApplication.getConversationMessages(
      this.getCurrentUserPubky(),
      CommerceRecordNormalizer.entityId(conversationId),
    );
  }

  static async getConversations() {
    return await MessagingApplication.getConversations(this.getCurrentUserPubky());
  }

  /**
   * One bounded inbox sync pass: candidate counterparties are the
   * participants of the user's durable orders and offers (the only channel
   * through which an unknown initiator can become known — the binding cannot
   * enumerate inbound handshakes from strangers) plus everyone with existing
   * local messaging state. Order/offer read failures degrade to local-only
   * candidates instead of failing the sync.
   */
  static async syncInbox(): Promise<void> {
    const ownerPubky = this.getCurrentUserPubky();
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
    candidates.delete(ownerPubky);
    await MessagingApplication.syncCounterparties(ownerPubky, [...candidates]);
  }

  /** True when encrypted messaging applies to the current adapter mode. */
  static isEncryptedMessagingMode(): boolean {
    return isDurableCommerceMode(getCommerceAdapterMode());
  }

  private static resolveConversation(sellerPubky: unknown, buyerPubky: unknown, listingId: unknown) {
    const seller = CommerceRecordNormalizer.pubky(sellerPubky);
    const buyer = CommerceRecordNormalizer.pubky(buyerPubky);
    const listing = CommerceRecordNormalizer.entityId(listingId);
    const ownerPubky = this.getCurrentUserPubky();
    const counterpartyPubky = ownerPubky === seller ? buyer : seller;
    return {
      ownerPubky,
      counterpartyPubky,
      conversationId: buildMarketplaceConversationAggregateId(seller, buyer, listing),
      listingRef: buildMarketplaceListingAggregateId(seller, listing),
    };
  }

  private static getCurrentUserPubky(): string {
    return useAuthStore.getState().selectCurrentUserPubky();
  }
}
