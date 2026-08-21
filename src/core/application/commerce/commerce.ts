import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { TagKind } from '@/application/tag/tag.types';
import { getCommerceAdapterMode, MARKETPLACE_FOLLOWED_SHELF_MAX_SELLER_FETCHES } from '@/config/commerce';
import { NEXUS_LISTINGS_PER_PAGE } from '@/config/nexus';
import { extractReviewAttestation, verifyOwnReviewAttestation } from '@/libs/commerce/attestation';
import { lockPolicyCreator, toBareLockResource } from '@/libs/commerce/locks-payment';
import {
  type CommerceDigitalLock,
  type CommerceListingRecord,
  commerceReviewRecordSchema,
  type CommerceShopRecord,
} from '@/libs/commerce/marketplace-records';
import { createCommerceSandboxCatalog } from '@/libs/commerce/sandbox-catalog';
import {
  buildMarketplaceListingAggregateId,
  buildMarketplacePaymentAggregateId,
  type MarketplaceCommand,
  type MarketplaceCommandResponse,
} from '@/libs/commerce/transaction-commands';
import type { CommerceJsonValue } from '@/libs/commerce/transaction-contracts';
import { ClientErrorCode, ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError, isNotFound } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import type { CommerceReviewModelSchema, CommerceSyncJobModelSchema } from '@/models/commerce/commerce.schema';
import { selectFollowedSellersToRefresh } from '@/pipes/commerce/commerce.discovery';
import { CommerceRecordNormalizer } from '@/pipes/commerce/commerce.normalizer';
import { CommerceHomeserverService } from '@/services/homeserver/commerce/commerce';
import { LocalCommerceService } from '@/services/local/commerce/commerce';
import {
  buildMarketplaceTagRowId,
  LocalMarketplaceTagService,
  type MarketplaceTagKind,
} from '@/services/local/tag/marketplace/tag.marketplace';
import { LocksGatewayService } from '@/services/locks/locks';
import {
  MarketplaceGatewayService,
  type MarketplaceOrder,
  type MarketplacePayment,
} from '@/services/marketplace/marketplace';
import { MarketplaceSessionService } from '@/services/marketplace/marketplace-session';
import { NexusMarketplaceService } from '@/services/nexus/marketplace/marketplace';
import type { NexusListingCondition, NexusListingSaleFormat } from '@/services/nexus/marketplace/marketplace.types';
import type { NexusTag } from '@/services/nexus/nexus.types';

/**
 * The `review` view inside a successful review command result (camelCased
 * by the wire boundary) — exactly the fields record publication needs.
 */
const reviewResultSchema = z
  .object({
    reviewerPubky: z.string().length(52),
    reviewerRole: z.enum(['buyer', 'seller']),
    subjectPubky: z.string().length(52),
    rating: z.number().int().min(1).max(5),
    text: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .passthrough();

export interface CommerceCatalogStreamFilters {
  saleFormat?: NexusListingSaleFormat;
  condition?: NexusListingCondition;
  /**
   * Ask Nexus for auctions ordered by soonest auction end
   * (`sorting=ends_at&order=ascending`) instead of the indexing timeline.
   * That stream contains only auction listings by definition.
   */
  endingSoonest?: boolean;
}

export class CommerceApplication {
  private constructor() {}

  static async getShop(ownerPubky: string) {
    return await LocalCommerceService.getShop(ownerPubky);
  }

  static async getAllShops() {
    return await LocalCommerceService.getAllShops();
  }

  static async fetchShop(ownerPubky: string): Promise<CommerceShopRecord> {
    const url = CommerceRecordNormalizer.shopUri(ownerPubky);
    return CommerceRecordNormalizer.shop(await CommerceHomeserverService.fetchJson(url));
  }

  static async getOrFetchShop(ownerPubky: string): Promise<CommerceShopRecord> {
    const local = await LocalCommerceService.getShop(ownerPubky);
    if (local) return local.record;

    const record = await this.fetchShop(ownerPubky);
    await LocalCommerceService.upsertShop(record, 'synced');
    return record;
  }

  static async getListing(compositeListingId: string) {
    return await LocalCommerceService.getListing(compositeListingId);
  }

  /**
   * Reads the locally cached community tag aggregate for a marketplace target.
   *
   * @param kind - `TagKind.LISTING` or `TagKind.SHOP`
   * @param taggedId - Composite `seller:listingId` for listings, owner pubky for shops
   * @returns The cached NexusTag[] aggregate (viewer's own write-through included)
   */
  static async getMarketplaceTags(kind: MarketplaceTagKind, taggedId: string): Promise<NexusTag[]> {
    return await LocalMarketplaceTagService.read(buildMarketplaceTagRowId(kind, taggedId));
  }

  /**
   * Fetches the community tag aggregate for a marketplace target from the
   * marketplace Nexus and merges it into the local cache.
   *
   * Honest degradation: the tag endpoints only exist once the marketplace
   * Nexus deploys tag aggregation. A 404 means "aggregation not available",
   * so this returns an empty array WITHOUT touching the local cache — the
   * viewer's own locally written tags keep rendering, and nothing fake is
   * shown. Any other error propagates.
   *
   * @param params.kind - `TagKind.LISTING` or `TagKind.SHOP`
   * @param params.taggedId - Composite `seller:listingId` for listings, owner pubky for shops
   * @param params.viewerId - Viewer pubky for relationship data, if signed in
   * @param params.skip - Number of tags to skip (pagination)
   * @param params.limit - Maximum number of tags to return
   * @returns Tags returned by Nexus; empty when the endpoint is not deployed (404)
   */
  static async fetchMarketplaceTags({
    kind,
    taggedId,
    viewerId,
    skip,
    limit,
  }: {
    kind: MarketplaceTagKind;
    taggedId: string;
    viewerId?: string;
    skip?: number;
    limit?: number;
  }): Promise<NexusTag[]> {
    let nexusTags: NexusTag[];
    try {
      if (kind === TagKind.LISTING) {
        const [sellerId, listingId] = taggedId.split(':');
        nexusTags = await NexusMarketplaceService.fetchListingTags({
          seller_id: sellerId,
          listing_id: listingId,
          skip_tags: skip,
          limit_tags: limit,
          viewer_id: viewerId,
        });
      } else {
        nexusTags = await NexusMarketplaceService.fetchShopTags({
          seller_id: taggedId,
          skip_tags: skip,
          limit_tags: limit,
          viewer_id: viewerId,
        });
      }
    } catch (error) {
      if (isAppError(error) && isNotFound(error)) {
        return [];
      }
      throw error;
    }

    if (nexusTags.length > 0) {
      await LocalMarketplaceTagService.mergeTags({
        taggedId: buildMarketplaceTagRowId(kind, taggedId),
        tags: nexusTags,
        viewerId: viewerId ?? null,
      });
    }

    return nexusTags;
  }

  static async getListingsBySeller(sellerPubky: string) {
    return await LocalCommerceService.getListingsBySeller(sellerPubky);
  }

  static async getListingsByCategory(categoryId: string) {
    return await LocalCommerceService.getListingsByCategory(categoryId);
  }

  static async getAllListings() {
    return await LocalCommerceService.getAllListings();
  }

  static async getListingDrafts(ownerPubky: string) {
    return await LocalCommerceService.getDraftsByOwner(ownerPubky);
  }

  static async commitUpdateListingDraft(ownerPubky: string, listingId: string, form: CommerceJsonValue): Promise<void> {
    await LocalCommerceService.upsertDraft({
      ownerId: ownerPubky,
      listingId,
      data: { ownerPubky, listingId, form },
      now: Date.now(),
    });
  }

  static async commitDeleteListingDraft(ownerPubky: string, listingId: string): Promise<void> {
    await LocalCommerceService.deleteDraft(`${ownerPubky}:${listingId}`);
  }

  static async initializeSandboxCatalog(): Promise<boolean> {
    if (getCommerceAdapterMode() !== 'sandbox') return false;
    const catalog = createCommerceSandboxCatalog();
    const seeded = await LocalCommerceService.seedSandboxCatalog(catalog);
    await Promise.allSettled(catalog.listings.map((listing) => this.registerListing(listing)));
    return seeded;
  }

  static async executeMarketplaceCommand(actorPubky: string, command: MarketplaceCommand) {
    return await MarketplaceGatewayService.execute(actorPubky, command);
  }

  /**
   * Starts the interactive Marketplace Transaction Service session flow:
   * returns the `pubkyauth://` authorization URL to hand to the user's signer
   * (QR or deeplink) plus a lazy `awaitSession` that resolves once the signer
   * approves and the AuthToken is exchanged for a bearer session. AuthTokens
   * are single-use, so every retry must come back through here for a fresh
   * flow. Durable modes only; the service fails closed otherwise.
   */
  static beginMarketplaceSessionFlow() {
    return MarketplaceSessionService.beginSessionFlow();
  }

  /**
   * Restores the account-scoped marketplace session persisted in
   * `sessionStorage`, returning its public facts (never the token) or null
   * when nothing valid is persisted for this account.
   */
  static restoreMarketplaceSession(pubky: string) {
    return MarketplaceSessionService.restorePersistedSession(pubky);
  }

  /**
   * Drops the Marketplace Transaction Service session from memory and from
   * `sessionStorage`. Part of the sign-out teardown: the bearer token must not
   * survive the user it was minted for (this is the single cleanup point).
   */
  static clearMarketplaceSession(): void {
    MarketplaceSessionService.clearSession();
  }

  static async getMarketplaceListingProjection(actorPubky: string | null, aggregateId: string) {
    return await MarketplaceGatewayService.getListing(actorPubky, aggregateId);
  }

  static async getMarketplaceConversations(actorPubky: string) {
    return await MarketplaceGatewayService.getConversations(actorPubky);
  }

  static async getMarketplaceOffers(actorPubky: string) {
    return await MarketplaceGatewayService.getOffers(actorPubky);
  }

  static async getMarketplaceNotifications(actorPubky: string) {
    return await MarketplaceGatewayService.getNotifications(actorPubky);
  }

  static async getMarketplaceNotificationPreferences(actorPubky: string) {
    return await MarketplaceGatewayService.getNotificationPreferences(actorPubky);
  }

  static async getMarketplaceOrders(actorPubky: string) {
    return await MarketplaceGatewayService.getOrders(actorPubky);
  }

  static async getMarketplacePayment(actorPubky: string, paymentId: string) {
    return await MarketplaceGatewayService.getPayment(actorPubky, paymentId);
  }

  static async getMarketplaceReceipt(actorPubky: string, receiptId: string) {
    return await MarketplaceGatewayService.getReceipt(actorPubky, receiptId);
  }

  static async getMarketplaceReports(actorPubky: string) {
    return await MarketplaceGatewayService.getReports(actorPubky);
  }

  static async getMarketplaceOrder(actorPubky: string, orderId: string) {
    return await MarketplaceGatewayService.getOrder(actorPubky, orderId);
  }

  static async getMarketplaceDisputes(actorPubky: string) {
    return await MarketplaceGatewayService.getDisputes(actorPubky);
  }

  static async getMarketplaceOrderEvidence(actorPubky: string, orderId: string) {
    return await MarketplaceGatewayService.getOrderEvidence(actorPubky, orderId);
  }

  static async uploadMarketplaceAttachment(actorPubky: string, recipientPubky: string, file: File) {
    return await MarketplaceGatewayService.uploadAttachment(actorPubky, recipientPubky, file);
  }

  static async fetchMarketplaceAttachment(actorPubky: string, attachmentId: string) {
    return await MarketplaceGatewayService.fetchAttachment(actorPubky, attachmentId);
  }

  static async submitLocksPaykitProof(params: {
    creatorPubky: string;
    readerPubky: string;
    bundleId: string;
    lockResource: string;
    criterionId: string;
  }) {
    return await LocksGatewayService.submitPaykitProof(params);
  }

  /**
   * The buyer's side of a real Locks/Paykit payment (`locks-paykit` mode):
   *
   * 1. Generate (or reuse a persisted, not-yet-registered) bundle id and
   *    submit the proof bundle to the Lock Server, which requests the real
   *    Paykit invoice and delivers the private Payment Request to the buyer's
   *    wallet.
   * 2. Register the correlation with the transaction service via
   *    `payment.register_locks`, sourcing `expected_revision` from the fresh
   *    payment projection the caller just read.
   *
   * This NEVER advances the payment: registration flips the payment to the
   * `locks` adapter and the service's worker independently verifies the Locks
   * lifecycle before confirming (ADR-0019 §7). Returns the raw command
   * response so callers can apply the standard revision-conflict handling
   * (refetch and retry). The correlation — including the bearer bundle id —
   * is persisted in the buyer's account-scoped database so the flow survives
   * a reload and the purchased content stays unlockable.
   */
  static async beginMarketplaceLocksPayment({
    buyerPubky,
    order,
    payment,
    digitalLock,
  }: {
    buyerPubky: string;
    order: MarketplaceOrder;
    payment: MarketplacePayment;
    digitalLock: CommerceDigitalLock;
  }): Promise<MarketplaceCommandResponse> {
    if (getCommerceAdapterMode() !== 'locks-paykit') {
      throw Err.client(ClientErrorCode.BAD_REQUEST, 'Real Locks/Paykit payments are not enabled in this deployment.', {
        service: ErrorService.Locks,
        operation: 'beginMarketplaceLocksPayment',
      });
    }
    const creator = lockPolicyCreator(digitalLock.policyUri);
    const bareLockResource = toBareLockResource(digitalLock.policyUri);
    if (!creator || !bareLockResource) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'The listing carries an invalid Locks policy URI.', {
        service: ErrorService.Locks,
        operation: 'beginMarketplaceLocksPayment',
      });
    }
    if (creator !== order.sellerPubky) {
      // The service enforces this too; refusing here keeps a mismatched lock
      // from ever producing an upstream lifecycle.
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'The lock creator is not this order\u2019s seller.', {
        service: ErrorService.Locks,
        operation: 'beginMarketplaceLocksPayment',
      });
    }

    const existing = await LocalCommerceService.getLocksCorrelation(buyerPubky, payment.id);
    let bundleId = existing?.bundle_id;
    if (!existing) {
      bundleId = await LocksGatewayService.generateBundleId();
      await LocksGatewayService.submitPaykitProof({
        creatorPubky: creator,
        readerPubky: buyerPubky,
        bundleId,
        lockResource: digitalLock.policyUri,
        criterionId: digitalLock.criterionId,
      });
      // Persist BEFORE registration: the bundle id is the buyer's only handle
      // on the upstream lifecycle, so losing it between the two steps would
      // orphan the payment request.
      await LocalCommerceService.upsertLocksCorrelation({
        owner_id: buyerPubky,
        payment_id: payment.id,
        order_id: order.id,
        seller_pubky: creator,
        bundle_id: bundleId,
        policy_uri: digitalLock.policyUri,
        criterion_id: digitalLock.criterionId,
        content_path: digitalLock.contentPath,
        resource_hash: digitalLock.resourceHash,
        window_expires_at: null,
        registered: false,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    }

    const response = await MarketplaceGatewayService.execute(buyerPubky, {
      version: 1,
      commandId: crypto.randomUUID(),
      aggregateId: buildMarketplacePaymentAggregateId(payment.id),
      expectedRevision: payment.revision,
      issuedAt: new Date().toISOString(),
      kind: 'payment.register_locks',
      payload: { paymentId: payment.id, bundleId: bundleId!, pubkyLockResource: bareLockResource },
    });
    if (response.ok) {
      const verification = (response.result as { verification?: { windowExpiresAt?: string } }).verification;
      await LocalCommerceService.markLocksCorrelationRegistered(
        buyerPubky,
        payment.id,
        verification?.windowExpiresAt ?? null,
        Date.now(),
      );
    }
    return response;
  }

  static async getMarketplaceLocksCorrelation(buyerPubky: string, paymentId: string) {
    return await LocalCommerceService.getLocksCorrelation(buyerPubky, paymentId);
  }

  /**
   * Redeems a confirmed Locks payment for the purchased digital content:
   * issues the short-lived access credential from the persisted bundle id,
   * reads the guarded bytes through the Lock Server proxy, and verifies their
   * BLAKE3 hash against the hash the seller published in the listing record.
   * A hash mismatch is a content-integrity failure and throws — the bytes are
   * never returned as if they were the purchased content.
   */
  static async unlockMarketplaceLocksContent(
    buyerPubky: string,
    paymentId: string,
  ): Promise<{ bytes: Uint8Array; contentPath: string }> {
    const correlation = await LocalCommerceService.getLocksCorrelation(buyerPubky, paymentId);
    if (!correlation) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'No Locks correlation is stored for this payment.', {
        service: ErrorService.Locks,
        operation: 'unlockMarketplaceLocksContent',
      });
    }
    const credential = await LocksGatewayService.issueAccessCredential(correlation.seller_pubky, correlation.bundle_id);
    const blob = await LocksGatewayService.fetchGuardedContent(correlation.content_path, credential.credential);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const digest = bytesToHex(blake3(bytes));
    if (digest !== correlation.resource_hash) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'The delivered content does not match the listed hash.', {
        service: ErrorService.Locks,
        operation: 'unlockMarketplaceLocksContent',
        context: { contentPath: correlation.content_path },
      });
    }
    return { bytes, contentPath: correlation.content_path };
  }

  /**
   * Exchanges a Lock Server legacy-connect completion (`code`/`state` on the
   * return URL) for a creator frontend session — the seller-setup "connected"
   * proof. The bearer token stays with the caller, in memory.
   */
  static async createLocksFrontendSession(code: string, state: string) {
    return await LocksGatewayService.createFrontendSession(code, state);
  }

  static async lookupLocksVerification(creatorPubky: string, bundleId: string) {
    return await LocksGatewayService.lookupVerification(creatorPubky, bundleId);
  }

  static async issueLocksAccessCredential(creatorPubky: string, bundleId: string) {
    return await LocksGatewayService.issueAccessCredential(creatorPubky, bundleId);
  }

  static async fetchLocksGuardedContent(relativePath: string, credential: string) {
    return await LocksGatewayService.fetchGuardedContent(relativePath, credential);
  }

  static getPaykitSetupUrl(returnTo: string, state: string) {
    return LocksGatewayService.buildPaykitSetupUrl(returnTo, state);
  }

  static async isFavorite(ownerPubky: string, listingId: string): Promise<boolean> {
    return await LocalCommerceService.isFavorite(ownerPubky, listingId);
  }

  static async getCartItems(ownerPubky: string) {
    return await LocalCommerceService.getCartItems(ownerPubky);
  }

  static async commitUpsertCartItem(
    ownerPubky: string,
    listingId: string,
    variantId: string,
    quantity: number,
  ): Promise<void> {
    await LocalCommerceService.upsertCartItem(ownerPubky, listingId, variantId, quantity, Date.now());
  }

  static async commitDeleteCartItem(ownerPubky: string, listingId: string, variantId: string): Promise<void> {
    await LocalCommerceService.deleteCartItem(ownerPubky, listingId, variantId);
  }

  static async commitClearCart(ownerPubky: string): Promise<void> {
    await LocalCommerceService.clearCart(ownerPubky);
  }

  static async getFavorites(ownerPubky: string) {
    return await LocalCommerceService.getFavorites(ownerPubky);
  }

  static async commitCreateFavorite(ownerPubky: string, listingId: string): Promise<void> {
    await LocalCommerceService.createFavorite(ownerPubky, listingId, Date.now());
  }

  static async commitDeleteFavorite(ownerPubky: string, listingId: string): Promise<void> {
    await LocalCommerceService.deleteFavorite(ownerPubky, listingId);
  }

  static async isShopFollowed(ownerPubky: string, sellerPubky: string): Promise<boolean> {
    return await LocalCommerceService.isShopFollowed(ownerPubky, sellerPubky);
  }

  static async getShopFollows(ownerPubky: string) {
    return await LocalCommerceService.getShopFollows(ownerPubky);
  }

  static async commitCreateShopFollow(ownerPubky: string, sellerPubky: string): Promise<void> {
    await LocalCommerceService.createShopFollow(ownerPubky, sellerPubky, Date.now());
  }

  static async commitDeleteShopFollow(ownerPubky: string, sellerPubky: string): Promise<void> {
    await LocalCommerceService.deleteShopFollow(ownerPubky, sellerPubky);
  }

  static async getAllCatalogEntries() {
    return await LocalCommerceService.getAllCatalogEntries();
  }

  static async getCatalogEntriesBySeller(sellerPubky: string) {
    return await LocalCommerceService.getCatalogEntriesBySeller(sellerPubky);
  }

  /**
   * Populates the local catalog cache from the Nexus marketplace index.
   *
   * The index now carries everything a catalog card renders (including
   * auction terms), so discovery validates the stream and stores the
   * normalized entries directly — one request, no per-listing homeserver
   * hydration. The canonical owner-signed record is fetched lazily, when a
   * listing is actually opened (`getOrFetchListing`), keeping the homeserver
   * canonical per ADR-0020. Shop profiles are the one card field the index
   * cannot supply, so sellers without a locally cached shop record are still
   * hydrated here (deduplicated, cache-first).
   *
   * Sandbox catalogs are seeded locally and stay self-contained: querying the
   * index there would blend real network listings into a demo catalog of
   * fictional sellers, so sandbox mode never reads from Nexus.
   *
   * Per-shop hydration failures are logged and skipped so one unreachable
   * seller cannot block the rest of the catalog (cards fall back to the
   * seller's pubky until the shop record is reachable).
   */
  static async fetchCatalogListings(filters: CommerceCatalogStreamFilters = {}): Promise<void> {
    if (getCommerceAdapterMode() === 'sandbox') return;

    const payload = await NexusMarketplaceService.fetchListingStream({
      state: 'active',
      limit: NEXUS_LISTINGS_PER_PAGE,
      ...(filters.saleFormat ? { sale_format: filters.saleFormat } : {}),
      ...(filters.condition ? { condition: filters.condition } : {}),
      ...(filters.endingSoonest ? { sorting: 'ends_at' as const, order: 'ascending' as const } : {}),
    });
    const entries = CommerceRecordNormalizer.nexusListingStream(payload);
    await LocalCommerceService.bulkUpsertCatalogEntries(entries);
    await this.hydrateDiscoveredShops([...new Set(entries.map(({ seller_id }) => seller_id))]);
  }

  /**
   * Populates the local catalog cache with one seller's active listings from
   * the Nexus index — what a direct visit to a shop page needs when the
   * visitor never browsed the main catalog. Sandbox catalogs are seeded
   * locally, so (as with {@link fetchCatalogListings}) sandbox mode never
   * reads from Nexus.
   */
  static async fetchSellerCatalogListings(sellerPubky: string): Promise<void> {
    if (getCommerceAdapterMode() === 'sandbox') return;

    const payload = await NexusMarketplaceService.fetchListingStream({
      seller_id: sellerPubky,
      state: 'active',
      limit: NEXUS_LISTINGS_PER_PAGE,
    });
    const entries = CommerceRecordNormalizer.nexusListingStream(payload);
    await LocalCommerceService.bulkUpsertCatalogEntries(entries);
  }

  /**
   * Refreshes the catalog cache with recent active listings from the sellers
   * a viewer follows, for the home-feed "From sellers you follow" shelf.
   *
   * Cost model — the Nexus listing stream accepts one `seller_id` per
   * request, so intersecting a follow graph with the index can never be one
   * query. This method bounds the cost instead of hiding it:
   *
   * 1. ONE shared global page of the newest active listings (the same read
   *    the catalog grid does) — it both refreshes the cache and cheaply
   *    discovers followed accounts that recently listed something.
   * 2. Per-seller refreshes ONLY for follows already known to sell (cached
   *    shop record or cached index entry), capped at
   *    {@link MARKETPLACE_FOLLOWED_SHELF_MAX_SELLER_FETCHES} — never a
   *    request per follow (see {@link selectFollowedSellersToRefresh}).
   *
   * Degradation: a failed global page falls back to refreshing cache-known
   * sellers; failed per-seller refreshes are logged and skipped
   * (`allSettled`) so one unreachable seller cannot empty the shelf; when
   * everything fails the shelf renders whatever the cache honestly holds.
   * Sandbox catalogs are seeded locally and never read from Nexus.
   */
  static async fetchFollowedSellerCatalogListings(followedPubkys: string[]): Promise<void> {
    if (getCommerceAdapterMode() === 'sandbox') return;
    if (followedPubkys.length === 0) return;

    try {
      const payload = await NexusMarketplaceService.fetchListingStream({
        state: 'active',
        limit: NEXUS_LISTINGS_PER_PAGE,
      });
      await LocalCommerceService.bulkUpsertCatalogEntries(CommerceRecordNormalizer.nexusListingStream(payload));
    } catch (error) {
      Logger.warn('Failed to refresh the global listing page for the followed-sellers shelf; using cache only', {
        error,
      });
    }

    const [entries, shops] = await Promise.all([
      LocalCommerceService.getAllCatalogEntries(),
      LocalCommerceService.getAllShops(),
    ]);
    const knownSellerIds = new Set([
      ...entries.map(({ seller_id }) => seller_id),
      ...shops.map(({ owner_id }) => owner_id),
    ]);
    const sellersToRefresh = selectFollowedSellersToRefresh(
      followedPubkys,
      knownSellerIds,
      MARKETPLACE_FOLLOWED_SHELF_MAX_SELLER_FETCHES,
    );
    if (sellersToRefresh.length === 0) return;

    const results = await Promise.allSettled(
      sellersToRefresh.map((sellerId) => this.fetchSellerCatalogListings(sellerId)),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        Logger.warn('Failed to refresh a followed seller for the shelf; keeping their cached listings', {
          sellerId: sellersToRefresh[index],
          error: result.reason,
        });
      }
    });

    await this.hydrateDiscoveredShops(sellersToRefresh);
  }

  private static async hydrateDiscoveredShops(sellerIds: string[]): Promise<void> {
    const shopResults = await Promise.allSettled(sellerIds.map((sellerId) => this.getOrFetchShop(sellerId)));
    shopResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        Logger.warn('Failed to hydrate a discovered marketplace shop', {
          sellerId: sellerIds[index],
          error: result.reason,
        });
      }
    });
  }

  static async fetchListing(ownerPubky: string, listingId: string): Promise<CommerceListingRecord> {
    const url = CommerceRecordNormalizer.listingUri(ownerPubky, listingId);
    return CommerceRecordNormalizer.listing(await CommerceHomeserverService.fetchJson(url));
  }

  /**
   * Returns the canonical listing record, fetching it from the owner
   * homeserver when it is not cached — or when the Nexus index has seen a
   * newer revision than the cache holds, so opening a listing always shows
   * the freshest record the network can supply. When a refresh fails but a
   * cached record exists, the cached record is returned (local-first
   * degradation, mirroring the catalog's behavior when Nexus is down).
   */
  static async getOrFetchListing(ownerPubky: string, listingId: string): Promise<CommerceListingRecord> {
    const compositeListingId = `${ownerPubky}:${listingId}`;
    const [local, indexed] = await Promise.all([
      LocalCommerceService.getListing(compositeListingId),
      LocalCommerceService.getCatalogEntry(compositeListingId),
    ]);
    if (local && (!indexed || local.revision >= indexed.revision)) return local.record;

    try {
      const record = await this.fetchListing(ownerPubky, listingId);
      await LocalCommerceService.upsertListing(record, 'synced');
      return record;
    } catch (error) {
      if (!local) throw error;
      Logger.warn('Failed to refresh a stale marketplace listing; serving the cached record', {
        listing: compositeListingId,
        error,
      });
      return local.record;
    }
  }

  /**
   * The seller's standing amount-band consent (ratified D2, ADR 0024).
   * `null` means the running backend has no attestation support at all
   * (sandbox) — callers render absence, never a fake false.
   */
  static async getMarketplaceBandConsent(actorPubky: string, sellerPubky: string): Promise<boolean | null> {
    return await MarketplaceGatewayService.getBandConsent(actorPubky, sellerPubky);
  }

  static async getOwnMarketplaceReview(actorPubky: string, orderId: string): Promise<CommerceReviewModelSchema | null> {
    return (await LocalCommerceService.getOwnReviewByOrder(actorPubky, orderId)) ?? null;
  }

  /**
   * Publishes the reviewer-owned public review record after a successful
   * `review.create`/`review.update` (trust & reputation plan P1.6): builds
   * the `PubkyAppMarketplaceReview` via the specs builder (deterministic
   * hash ID), embeds the service-issued purchase attestation verbatim in
   * `eligibilityAttestation`, and PUTs it to the reviewer's homeserver with
   * the staged-job outbox pattern listing publication established — a failed
   * PUT leaves a visible pending row that
   * {@link resumeOwnReviewPublications} retries.
   *
   * Returns `null` (publishing nothing) when the command result carries no
   * attestation: the record's `eligibilityAttestation` is required, so a
   * deployment without an attestor keeps reviews service-only — an honest
   * absence, not a failure.
   */
  static async commitPublishOwnReview(input: {
    actorPubky: string;
    order: MarketplaceOrder;
    result: Record<string, unknown>;
  }): Promise<CommerceReviewModelSchema | null> {
    const { actorPubky, order, result } = input;
    const attestation = extractReviewAttestation(result);
    if (attestation === null) return null;
    const review = reviewResultSchema.parse(result.review);

    const listingPrefix = `listing:${order.sellerPubky}_`;
    const listingAggregateId = order.lines[0]?.listingAggregateId ?? '';
    if (!listingAggregateId.startsWith(listingPrefix)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Order lines carry no parseable listing identity.', {
        service: ErrorService.Marketplace,
        operation: 'commitPublishOwnReview',
        context: { orderId: order.id },
      });
    }
    const listingId = listingAggregateId.slice(listingPrefix.length);
    const role = review.reviewerRole === 'buyer' ? 'buyer_reviewing_seller' : 'seller_reviewing_buyer';

    const build = async (revision: number, createdAt: string) => {
      const { PubkySpecsBuilder } = await import('pubky-app-specs');
      const built = new PubkySpecsBuilder(actorPubky).createMarketplaceReview({
        schemaVersion: 1,
        recordType: 'review',
        ownerPubky: actorPubky,
        revision,
        createdAt,
        updatedAt: review.updatedAt,
        reviewId: '',
        subjectPubky: review.subjectPubky,
        listingOwnerPubky: order.sellerPubky,
        listingId,
        role,
        ratings: { overall: review.rating },
        text: review.text,
        eligibilityAttestation: attestation.jws,
      });
      return {
        record: commerceReviewRecordSchema.parse(built.marketplace_review.toJson()),
        reviewId: built.meta.id,
      };
    };

    // The hash ID is deterministic per (listing, subject, role): a revision
    // of the living record — an edit, or a repeat purchase refreshing the
    // attestation — bumps `revision` and keeps the original `createdAt`.
    const probe = await build(1, review.createdAt);
    const prior = await LocalCommerceService.getOwnReviewById(`${actorPubky}:${probe.reviewId}`);
    const { record, reviewId } =
      prior === undefined ? probe : await build(prior.record.revision + 1, prior.record.createdAt);

    const verifiedIss = verifyOwnReviewAttestation(record);
    const model: CommerceReviewModelSchema = {
      id: `${actorPubky}:${reviewId}`,
      owner_id: actorPubky,
      review_id: reviewId,
      order_id: order.id,
      subject_id: record.subjectPubky,
      record,
      attestation_verified: verifiedIss !== null,
      attestation_iss: verifiedIss,
      sync_status: 'pending',
      updated_at: Date.now(),
    };
    const url = CommerceRecordNormalizer.reviewUri(actorPubky, reviewId);
    const job = this.createSyncJob({
      ownerId: actorPubky,
      entityType: 'review',
      entityId: reviewId,
      operation: 'publish',
      payload: { url },
      now: Date.now(),
    });

    await LocalCommerceService.stageOwnReviewSync(model, job);
    await CommerceHomeserverService.putJson(url, { ...record });
    const synced: CommerceReviewModelSchema = { ...model, sync_status: 'synced', updated_at: Date.now() };
    await LocalCommerceService.upsertOwnReview(synced);
    await LocalCommerceService.completeSyncJob(job.id);
    return synced;
  }

  /**
   * Retries every own-review record whose homeserver PUT never landed (the
   * visible retryable outbox): re-publishes the staged record verbatim and
   * marks it synced. Called when the orders surface loads, so a failed
   * publication heals on the next visit instead of rotting silently.
   */
  static async resumeOwnReviewPublications(actorPubky: string): Promise<number> {
    const pending = await LocalCommerceService.getPendingOwnReviews(actorPubky);
    let published = 0;
    for (const row of pending) {
      const url = CommerceRecordNormalizer.reviewUri(row.owner_id, row.review_id);
      try {
        await CommerceHomeserverService.putJson(url, { ...row.record });
        await LocalCommerceService.upsertOwnReview({ ...row, sync_status: 'synced', updated_at: Date.now() });
        published += 1;
      } catch (error) {
        Logger.warn('Own review publication retry failed; the row stays pending', {
          reviewId: row.review_id,
          error,
        });
      }
    }
    return published;
  }

  static async commitUpsertShop(record: CommerceShopRecord): Promise<void> {
    const now = Date.now();
    const url = CommerceRecordNormalizer.shopUri(record.ownerPubky);
    const job = this.createSyncJob({
      ownerId: record.ownerPubky,
      entityType: 'shop',
      entityId: record.ownerPubky,
      operation: 'publish',
      payload: { url },
      now,
    });

    await LocalCommerceService.stageShopSync(record, job);
    await CommerceHomeserverService.putJson(url, { ...record });
    await LocalCommerceService.upsertShop(record, 'synced');
    await LocalCommerceService.completeSyncJob(job.id);
  }

  static async commitUpsertListing(record: CommerceListingRecord): Promise<void> {
    const now = Date.now();
    const url = CommerceRecordNormalizer.listingUri(record.ownerPubky, record.listingId);
    const publishJob = this.createSyncJob({
      ownerId: record.ownerPubky,
      entityType: 'listing',
      entityId: record.listingId,
      operation: 'publish',
      payload: { url },
      now,
    });

    await LocalCommerceService.stageListingSync(record, publishJob);
    await CommerceHomeserverService.putJson(url, { ...record });
    await LocalCommerceService.upsertListing(record, 'synced');
    await LocalCommerceService.completeSyncJob(publishJob.id);

    // Registration is idempotent (skipped when the aggregate already has a server
    // revision), so retrying the whole commit after a failure here is safe.
    if (getCommerceAdapterMode() === 'sandbox') {
      await this.registerListing(record);
    }
  }

  /**
   * Deletes a listing the current user owns: removes the owner-signed record
   * from the homeserver (the canonical copy indexers read), then clears every
   * local cache of it. Media files are deleted afterwards as best-effort
   * cleanup — a media file that outlives its record is unreferenced bytes,
   * not a live listing, so media failures never block the deletion.
   */
  static async commitDeleteListing(ownerPubky: string, listingId: string): Promise<void> {
    const compositeListingId = `${ownerPubky}:${listingId}`;
    const local = await LocalCommerceService.getListing(compositeListingId);
    const url = CommerceRecordNormalizer.listingUri(ownerPubky, listingId);
    const job = this.createSyncJob({
      ownerId: ownerPubky,
      entityType: 'listing',
      entityId: listingId,
      operation: 'remove',
      payload: { url },
      now: Date.now(),
    });

    await LocalCommerceService.upsertSyncJob(job);
    await CommerceHomeserverService.delete(url);
    await LocalCommerceService.deleteListing(compositeListingId);
    await LocalCommerceService.completeSyncJob(job.id);

    if (local) {
      const mediaResults = await Promise.allSettled(
        local.record.media.map((media) => CommerceHomeserverService.delete(media.url)),
      );
      mediaResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          Logger.warn('Failed to delete an orphaned listing media file', {
            mediaUrl: local.record.media[index].url,
            error: result.reason,
          });
        }
      });
    }
  }

  static async commitCreateMedia(ownerPubky: string, mediaId: string, bytes: Uint8Array): Promise<string> {
    const url = CommerceRecordNormalizer.mediaUri(ownerPubky, mediaId);
    await CommerceHomeserverService.putMedia(url, bytes);
    return url;
  }

  private static async registerListing(listing: CommerceListingRecord): Promise<void> {
    const aggregateId = buildMarketplaceListingAggregateId(listing.ownerPubky, listing.listingId);
    const existing = await MarketplaceGatewayService.getListing(listing.ownerPubky, aggregateId);
    if (existing?.serverRevision) return;
    const unitPrice = listing.sale.format === 'fixed_price' ? listing.sale.unitPrice : listing.sale.startingPrice;
    const command = CommerceRecordNormalizer.marketplaceCommand({
      version: 1,
      commandId: crypto.randomUUID(),
      aggregateId,
      expectedRevision: 0,
      issuedAt: new Date().toISOString(),
      kind: 'listing.register',
      payload: {
        sellerPubky: listing.ownerPubky,
        listingId: listing.listingId,
        title: listing.title,
        listingRevision: listing.revision,
        contentHash: listing.media[0].contentHash,
        quantity: listing.variants.reduce((total, variant) => total + variant.quantity, 0),
        unitPrice,
        saleFormat: listing.sale.format,
        auctionTerms:
          listing.sale.format === 'auction'
            ? {
                startsAt: listing.sale.startsAt,
                endsAt: listing.sale.endsAt,
                minimumIncrement: listing.sale.minimumIncrement,
                reservePrice: listing.sale.reservePrice,
                antiSnipingWindowSeconds: listing.sale.antiSnipingWindowSeconds,
                antiSnipingExtensionSeconds: listing.sale.antiSnipingExtensionSeconds,
              }
            : undefined,
      },
    });
    await MarketplaceGatewayService.execute(listing.ownerPubky, command);
  }

  private static createSyncJob({
    ownerId,
    entityType,
    entityId,
    operation,
    payload,
    now,
  }: {
    ownerId: string;
    entityType: CommerceSyncJobModelSchema['entity_type'];
    entityId: string;
    operation: CommerceSyncJobModelSchema['operation'];
    payload: CommerceSyncJobModelSchema['payload'];
    now: number;
  }): CommerceSyncJobModelSchema {
    return {
      id: crypto.randomUUID(),
      owner_id: ownerId,
      entity_type: entityType,
      entity_id: entityId,
      operation,
      status: 'pending',
      attempts: 0,
      next_attempt_at: now,
      last_error_code: null,
      payload,
      created_at: now,
      updated_at: now,
    };
  }
}
