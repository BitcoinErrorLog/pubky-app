import { z } from 'zod';
import { getCommerceAdapterMode, getMarketplaceUrl, isDurableCommerceMode } from '@/config/commerce';
import {
  type PaymentMethodKind,
  type SellerPaymentConfig,
  type SellerPaymentConfigOwnView,
  sellerPaymentConfigOwnViewSchema,
  sellerPaymentConfigSchema,
} from '@/libs/commerce/payment-methods';
import {
  type MarketplaceCommand,
  type MarketplaceCommandResponse,
  marketplaceCommandResponseSchema,
} from '@/libs/commerce/transaction-commands';
import { commercePubkySchema } from '@/libs/commerce/transaction-contracts';
import { toCamelCaseWire, toSnakeCaseWire } from '@/libs/commerce/wire-casing';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import {
  type MarketplaceDisputeCaseFile,
  marketplaceDisputeCaseFileSchema,
  type MarketplaceListingProjection,
  marketplaceListingProjectionSchema,
  type MarketplaceNotification,
  marketplaceNotificationSchema,
  type MarketplaceOffer,
  marketplaceOfferSchema,
  type MarketplaceOrder,
  marketplaceOrderSchema,
  type MarketplacePayment,
  marketplacePaymentSchema,
  type MarketplaceReceipt,
  marketplaceReceiptSchema,
} from './marketplace-projections';
import { MarketplaceSessionService } from './marketplace-session';

/**
 * Command kinds the durable Rust service implements (its envelope contract
 * rejects everything else until it is ported with its tests). Kinds the
 * service does NOT implement are rejected here, before any bytes leave the
 * client, so simulated affordances cannot reach the authority:
 *
 * - `payment.sandbox_advance` exists on the service (it drives the sandbox
 *   payment adapter end to end in its own tests), but this client refuses to
 *   send it as a matter of policy — simulate buttons are sandbox-only.
 * - `payment.register_locks` IS sent: it registers the buyer's Locks
 *   lifecycle correlation and never advances the payment — the service's
 *   worker independently verifies the Locks lifecycle and confirms exactly
 *   once (ADR-0019 §7). Deployments without Locks configured refuse it.
 * - `message.send` and `notification.*` have no durable tables; messaging
 *   and notification preferences remain sandbox-only.
 */
const TRANSACTION_SERVICE_COMMAND_KINDS: ReadonlySet<MarketplaceCommand['kind']> = new Set([
  'listing.register',
  'listing.sync',
  'inventory.reserve',
  'checkout.create',
  'offer.create',
  'offer.counter',
  'offer.accept',
  'offer.reject',
  'offer.withdraw',
  'auction.place_bid',
  'auction.close',
  'payment.register_locks',
  'fulfillment.ship',
  'fulfillment.confirm_delivery',
  'order.cancel_request',
  'order.cancel_approve',
  'return.request',
  'return.approve',
  'return.receive',
  'refund.record_external',
  'dispute.open',
  'dispute.evidence',
  'dispute.resolve',
  'review.create',
  'review.update',
  'trust.report',
] satisfies MarketplaceCommand['kind'][]);

/**
 * Report view shared by both transports. The durable service adds `revision`
 * and `updatedAt` and moves reports past `open` via moderator decisions
 * (`trust.decide`); the sandbox never does either, so those fields stay
 * optional and `open` remains the only state it produces.
 */
export const marketplaceReportSchema = z
  .object({
    id: z.uuid(),
    reporterPubky: commercePubkySchema,
    targetType: z.enum(['listing', 'user', 'message', 'review']),
    targetId: z.string(),
    reason: z.enum(['prohibited_item', 'counterfeit', 'scam', 'harassment', 'unsafe', 'other']),
    details: z.string(),
    state: z.enum(['open', 'dismissed', 'actioned']),
    revision: z.number().int().positive().optional(),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

export type MarketplaceReport = z.infer<typeof marketplaceReportSchema>;

/**
 * Transport for the durable Rust Marketplace Transaction Service
 * (`pubky-marketplace-service`). Differences from the sandbox transport are
 * deliberate and load-bearing:
 *
 * - **Identity comes from the session**, never from a header. Requests carry
 *   the opaque bearer token issued by `POST /v1/auth/sessions`; the service
 *   resolves the actor from its stored hash. There is no `x-pubky-actor`.
 * - **Wire casing is snake_case** per ADR-0019 §3. The client's internal
 *   camelCase contracts are converted at this boundary only.
 * - **Role-scoped projection reads.** The service serves listings, offers,
 *   orders (with embedded payment/shipment/return/dispute/refund/review
 *   sub-objects), payments, receipts, notifications, and reports; every
 *   endpoint requires the same bearer session as `/v1/commands`, and
 *   participation is enforced server-side in SQL. Deliberate redactions
 *   (ADR-0019 §8): no `delivery_address`, no `locks_bundle_id`, and
 *   notifications carry no `revision`. Dispute evidence bodies never appear
 *   in general projections or command results (only `evidence_count`) — the
 *   single exposure path is the scoped case-file read
 *   `GET /v1/orders/{id}/evidence`, served to exactly the two dispute
 *   participants and configured moderators, with moderator reads audited
 *   server-side in the same transaction as the read. Conversations and
 *   notification preferences have NO durable tables and are not served at
 *   all — those stay sandbox-only.
 */
export class MarketplaceTransactionService {
  private constructor() {}

  static async execute(actor: string, command: MarketplaceCommand): Promise<MarketplaceCommandResponse> {
    this.assertTransactionServiceMode('execute');
    if (!TRANSACTION_SERVICE_COMMAND_KINDS.has(command.kind)) {
      throw Err.client(
        ClientErrorCode.BAD_REQUEST,
        `The marketplace transaction service does not support '${command.kind}' commands.`,
        {
          service: ErrorService.Marketplace,
          operation: 'execute',
          context: { kind: command.kind },
        },
      );
    }
    const session = this.requireSession('execute', actor);
    const url = `${getMarketplaceUrl()}/v1/commands`;
    const response = await safeFetch(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(toSnakeCaseWire(command)),
      },
      ErrorService.Marketplace,
      'execute',
    );
    this.throwIfSessionRejected(response.status, 'execute');
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'execute', url);
    const parsed = marketplaceCommandResponseSchema.safeParse(toCamelCaseWire(raw));
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned an invalid command response.', {
        service: ErrorService.Marketplace,
        operation: 'execute',
        context: { statusCode: response.status },
      });
    }
    return parsed.data;
  }

  static async getReports(actor: string): Promise<MarketplaceReport[]> {
    const raw = await this.readProjection('getReports', actor, '/v1/reports');
    return this.parseProjection(
      'getReports',
      z.object({ reports: z.array(marketplaceReportSchema) }),
      raw,
      'Marketplace returned invalid moderation reports.',
    ).reports;
  }

  /**
   * `GET /v1/listings/{aggregate_id}`: public catalog data, but still behind
   * the bearer session like every durable read. 404 means the aggregate was
   * never registered with the transaction authority.
   */
  static async getListing(actor: string, aggregateId: string): Promise<MarketplaceListingProjection | null> {
    const raw = await this.readProjection('getListing', actor, `/v1/listings/${encodeURIComponent(aggregateId)}`, {
      nullOnNotFound: true,
    });
    if (raw === null) return null;
    return this.parseProjection(
      'getListing',
      marketplaceListingProjectionSchema,
      raw,
      'Marketplace returned an invalid listing projection.',
    );
  }

  /** `GET /v1/offers`: offers where the session's pubky is buyer or seller. */
  static async getOffers(actor: string): Promise<MarketplaceOffer[]> {
    const raw = await this.readProjection('getOffers', actor, '/v1/offers');
    return this.parseProjection(
      'getOffers',
      z.object({ offers: z.array(marketplaceOfferSchema) }),
      raw,
      'Marketplace returned invalid offers.',
    ).offers;
  }

  /**
   * `GET /v1/orders`: participant-scoped orders, each carrying its embedded
   * `payment` projection plus shipment/return/dispute/refund/review
   * sub-objects. `receipt_id` stays null until payment confirmation issues
   * the durable receipt.
   */
  static async getOrders(actor: string): Promise<MarketplaceOrder[]> {
    const raw = await this.readProjection('getOrders', actor, '/v1/orders');
    return this.parseProjection(
      'getOrders',
      z.object({ orders: z.array(marketplaceOrderSchema) }),
      raw,
      'Marketplace returned invalid orders.',
    ).orders;
  }

  /** `GET /v1/payments/{id}`: participants only; foreign payments are 404. */
  static async getPayment(actor: string, paymentId: string): Promise<MarketplacePayment | null> {
    const raw = await this.readProjection('getPayment', actor, `/v1/payments/${encodeURIComponent(paymentId)}`, {
      nullOnNotFound: true,
    });
    if (raw === null) return null;
    return this.parseProjection(
      'getPayment',
      marketplacePaymentSchema,
      raw,
      'Marketplace returned an invalid payment.',
    );
  }

  /** `GET /v1/receipts/{id}`: issuer and recipient only; foreign receipts are 404. */
  static async getReceipt(actor: string, receiptId: string): Promise<MarketplaceReceipt | null> {
    const raw = await this.readProjection('getReceipt', actor, `/v1/receipts/${encodeURIComponent(receiptId)}`, {
      nullOnNotFound: true,
    });
    if (raw === null) return null;
    return this.parseProjection(
      'getReceipt',
      marketplaceReceiptSchema,
      raw,
      'Marketplace returned an invalid receipt.',
    );
  }

  /**
   * `GET /v1/orders/{id}`: one order with the embedded projections. The
   * service serves it to the two participants — and to configured moderators,
   * but only when the order is under (or was previously under) dispute.
   * 404 covers absent AND foreign orders indistinguishably, by design.
   */
  static async getOrder(actor: string, orderId: string): Promise<MarketplaceOrder | null> {
    const raw = await this.readProjection('getOrder', actor, `/v1/orders/${encodeURIComponent(orderId)}`, {
      nullOnNotFound: true,
    });
    if (raw === null) return null;
    return this.parseProjection('getOrder', marketplaceOrderSchema, raw, 'Marketplace returned an invalid order.');
  }

  /**
   * `GET /v1/disputes`: the moderator adjudication queue — the order
   * projection of every order under (or previously under) dispute. The
   * service refuses non-moderators with 403, never an empty list, so `null`
   * here means "this account is not a configured moderator" and the caller
   * must keep the queue absent rather than render it empty.
   */
  static async getDisputes(actor: string): Promise<MarketplaceOrder[] | null> {
    const raw = await this.readProjection('getDisputes', actor, '/v1/disputes', { nullOnForbidden: true });
    if (raw === null) return null;
    return this.parseProjection(
      'getDisputes',
      z.object({ disputes: z.array(marketplaceOrderSchema) }),
      raw,
      'Marketplace returned an invalid dispute queue.',
    ).disputes;
  }

  /**
   * `GET /v1/orders/{id}/evidence`: the dispute case file, newest-first. The
   * audience is exactly the two dispute participants plus configured
   * moderators; anyone else gets the same 404 an absent order returns, so
   * `null` never reveals whether the order exists. A moderator-role read is
   * recorded append-only by the service in the same transaction as the read —
   * opening a case file as a moderator is a logged action.
   */
  static async getOrderEvidence(actor: string, orderId: string): Promise<MarketplaceDisputeCaseFile | null> {
    const raw = await this.readProjection(
      'getOrderEvidence',
      actor,
      `/v1/orders/${encodeURIComponent(orderId)}/evidence`,
      { nullOnNotFound: true },
    );
    if (raw === null) return null;
    return this.parseProjection(
      'getOrderEvidence',
      marketplaceDisputeCaseFileSchema,
      raw,
      'Marketplace returned an invalid dispute case file.',
    );
  }

  /**
   * `GET /v1/sellers/{pubky}/band-consent`: the seller's standing
   * amount-band consent (ratified D2, ADR 0024). Readable by any
   * authenticated session — it is a disclosure preference, not private
   * order data — so a buyer's review dialog can honestly decide whether to
   * surface the per-review band opt-in. Absent row means false.
   */
  static async getBandConsent(actor: string, sellerPubky: string): Promise<boolean> {
    const raw = await this.readProjection(
      'getBandConsent',
      actor,
      `/v1/sellers/${encodeURIComponent(sellerPubky)}/band-consent`,
    );
    return this.parseProjection(
      'getBandConsent',
      z.object({ sellerPubky: commercePubkySchema, allowsAmountBand: z.boolean() }),
      raw,
      'Marketplace returned an invalid band-consent read.',
    ).allowsAmountBand;
  }

  /**
   * `GET /v1/orders/{id}/review-attestation`: the caller's own stored
   * purchase attestation for the order — idempotent re-fetch for
   * re-publication (issuance is deterministic per order+reviewer). Null when
   * the caller has not reviewed the order or the deployment issues no
   * attestations.
   */
  static async getReviewAttestation(actor: string, orderId: string): Promise<unknown | null> {
    const raw = await this.readProjection(
      'getReviewAttestation',
      actor,
      `/v1/orders/${encodeURIComponent(orderId)}/review-attestation`,
      { nullOnNotFound: true },
    );
    if (raw === null) return null;
    return this.parseProjection(
      'getReviewAttestation',
      z.object({ attestation: z.object({ jws: z.string().min(32) }).passthrough() }),
      raw,
      'Marketplace returned an invalid review attestation.',
    ).attestation;
  }

  /**
   * `GET /v1/notifications`: recipient-scoped delivered outbox rows. They
   * carry no `revision` — there is no notification command surface on the
   * durable service, so nothing can mark them read.
   */
  static async getNotifications(actor: string): Promise<MarketplaceNotification[]> {
    const raw = await this.readProjection('getNotifications', actor, '/v1/notifications');
    return this.parseProjection(
      'getNotifications',
      z.object({ notifications: z.array(marketplaceNotificationSchema) }),
      raw,
      'Marketplace returned invalid notifications.',
    ).notifications;
  }

  /**
   * Performs one bearer-authenticated projection read and returns the
   * camelCased body. Returns null for a 404 only when the endpoint is a
   * single-object read (`nullOnNotFound`), where the service deliberately
   * answers 404 for absent AND foreign aggregates; and for a 403 only when
   * the endpoint is role-gated (`nullOnForbidden`), where 403 means "the
   * session's pubky does not hold the required role".
   */
  /**
   * `GET /v0/sellers/{pubky}/payment-config` — deliberately public (no
   * bearer): buyers see a seller's available rails before committing to an
   * order. `bitcoinAvailable` is service-verified against paykit-server
   * (enabled AND actually claimed); a paykit outage surfaces as an error,
   * never a silent `false`.
   */
  static async getSellerPaymentConfig(sellerPubky: string): Promise<SellerPaymentConfig> {
    this.assertTransactionServiceMode('getSellerPaymentConfig');
    const url = `${getMarketplaceUrl()}/v0/sellers/${encodeURIComponent(sellerPubky)}/payment-config`;
    const response = await safeFetch(url, { method: 'GET' }, ErrorService.Marketplace, 'getSellerPaymentConfig');
    await this.throwPaymentMethodError(response, 'getSellerPaymentConfig');
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getSellerPaymentConfig', url);
    return this.parseProjection(
      'getSellerPaymentConfig',
      sellerPaymentConfigSchema,
      toCamelCaseWire(raw),
      'Marketplace returned an invalid seller payment configuration.',
    );
  }

  /**
   * `GET /v0/sellers/me/payment-config` — the seller's own STORED
   * configuration (no paykit availability lookup). `null` when nothing was
   * ever saved.
   */
  static async getMyPaymentConfig(actor: string): Promise<SellerPaymentConfigOwnView | null> {
    const raw = await this.readProjection('getMyPaymentConfig', actor, '/v0/sellers/me/payment-config');
    const parsed = this.parseProjection(
      'getMyPaymentConfig',
      z.object({ paymentConfig: sellerPaymentConfigOwnViewSchema.nullable() }),
      raw,
      'Marketplace returned an invalid payment configuration.',
    );
    return parsed.paymentConfig;
  }

  /**
   * `PUT /v0/sellers/me/payment-config` — the seller's own rails. The Stripe
   * restricted key is write-only: send it to set it, send `''` to clear it,
   * omit it to keep the stored one; only `stripeRestrictedKeySet` ever comes
   * back.
   */
  static async putMyPaymentConfig(
    actor: string,
    input: {
      bitcoinEnabled: boolean;
      stripePaymentLink: string | null;
      stripeRestrictedKey?: string;
      paypalMerchantEmail: string | null;
    },
  ): Promise<SellerPaymentConfigOwnView> {
    const raw = await this.paymentMethodRequest('putMyPaymentConfig', actor, '/v0/sellers/me/payment-config', {
      method: 'PUT',
      body: input,
    });
    const parsed = this.parseProjection(
      'putMyPaymentConfig',
      z.object({ paymentConfig: sellerPaymentConfigOwnViewSchema }),
      raw,
      'Marketplace returned an invalid payment configuration response.',
    );
    return parsed.paymentConfig;
  }

  /**
   * `POST /v0/orders/{id}/payment-method` — one-shot buyer binding. Binding
   * `bitcoin` creates the signed Paykit payment request inside the same
   * transaction, so a paykit refusal leaves the order unbound and retryable.
   */
  static async bindPaymentMethod(actor: string, orderId: string, method: PaymentMethodKind): Promise<MarketplaceOrder> {
    const raw = await this.paymentMethodRequest(
      'bindPaymentMethod',
      actor,
      `/v0/orders/${encodeURIComponent(orderId)}/payment-method`,
      { method: 'POST', body: { method } },
    );
    return this.parseOrderEnvelope('bindPaymentMethod', raw);
  }

  /**
   * `POST /v0/orders/{id}/fiat/verify` — Stripe only. The service checks the
   * seller's own Stripe account with their stored restricted key and pays the
   * order on an exact match; `verified: false` is an honest "not found yet",
   * not a failure.
   */
  static async verifyStripePayment(
    actor: string,
    orderId: string,
  ): Promise<{ verified: boolean; order: MarketplaceOrder | null }> {
    const raw = await this.paymentMethodRequest(
      'verifyStripePayment',
      actor,
      `/v0/orders/${encodeURIComponent(orderId)}/fiat/verify`,
      { method: 'POST', body: {} },
    );
    const parsed = this.parseProjection(
      'verifyStripePayment',
      z.object({ verified: z.boolean(), order: marketplaceOrderSchema.optional() }),
      raw,
      'Marketplace returned an invalid fiat verification response.',
    );
    return { verified: parsed.verified, order: parsed.order ?? null };
  }

  /** `POST /v0/orders/{id}/fiat/mark-paid` — buyer's PayPal payment report; never advances the payment itself. */
  static async markFiatPaid(actor: string, orderId: string, transactionRef?: string): Promise<MarketplaceOrder> {
    const raw = await this.paymentMethodRequest(
      'markFiatPaid',
      actor,
      `/v0/orders/${encodeURIComponent(orderId)}/fiat/mark-paid`,
      { method: 'POST', body: transactionRef ? { transactionRef } : {} },
    );
    return this.parseOrderEnvelope('markFiatPaid', raw);
  }

  /** `POST /v0/orders/{id}/fiat/confirm-received` — the seller's confirmation pays a PayPal order. */
  static async confirmFiatReceived(actor: string, orderId: string): Promise<MarketplaceOrder> {
    const raw = await this.paymentMethodRequest(
      'confirmFiatReceived',
      actor,
      `/v0/orders/${encodeURIComponent(orderId)}/fiat/confirm-received`,
      { method: 'POST', body: {} },
    );
    return this.parseOrderEnvelope('confirmFiatReceived', raw);
  }

  private static async paymentMethodRequest(
    operation: string,
    actor: string,
    path: string,
    request: { method: 'PUT' | 'POST'; body: unknown },
  ): Promise<unknown> {
    this.assertTransactionServiceMode(operation);
    const session = this.requireSession(operation, actor);
    const url = `${getMarketplaceUrl()}${path}`;
    const response = await safeFetch(
      url,
      {
        method: request.method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
        body: JSON.stringify(toSnakeCaseWire(request.body)),
      },
      ErrorService.Marketplace,
      operation,
    );
    this.throwIfSessionRejected(response.status, operation);
    await this.throwPaymentMethodError(response, operation);
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, operation, url);
    return toCamelCaseWire(raw);
  }

  /**
   * The payment-methods surface answers failures with
   * `{ok:false, error:{code, message, reason}}`. The server's `message` is
   * already user-facing and the `reason` sub-code (`stripe_key_invalid`,
   * `method_unavailable`, `payment_method_already_bound`, …) rides along in
   * the error context for callers that branch on it.
   */
  private static async throwPaymentMethodError(response: Response, operation: string): Promise<void> {
    if (response.ok) return;
    let reason: string | undefined;
    let message: string | undefined;
    try {
      const body = (await response.clone().json()) as { error?: { message?: string; reason?: string } };
      reason = body.error?.reason;
      message = body.error?.message;
    } catch {
      // A non-JSON failure body falls through to the generic parse error.
    }
    if (!message) return;
    throw Err.client(ClientErrorCode.BAD_REQUEST, message, {
      service: ErrorService.Marketplace,
      operation,
      context: { statusCode: response.status, reason },
    });
  }

  private static parseOrderEnvelope(operation: string, raw: unknown): MarketplaceOrder {
    const parsed = this.parseProjection(
      operation,
      z.object({ order: marketplaceOrderSchema }),
      raw,
      'Marketplace returned an invalid order response.',
    );
    return parsed.order;
  }

  private static async readProjection(
    operation: string,
    actor: string,
    path: string,
    options: { nullOnNotFound?: boolean; nullOnForbidden?: boolean } = {},
  ): Promise<unknown> {
    this.assertTransactionServiceMode(operation);
    const session = this.requireSession(operation, actor);
    const url = `${getMarketplaceUrl()}${path}`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { authorization: `Bearer ${session.token}` } },
      ErrorService.Marketplace,
      operation,
    );
    this.throwIfSessionRejected(response.status, operation);
    if (options.nullOnNotFound && response.status === HttpStatusCode.NOT_FOUND) return null;
    if (options.nullOnForbidden && response.status === HttpStatusCode.FORBIDDEN) return null;
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, operation, url);
    return toCamelCaseWire(raw);
  }

  private static parseProjection<Schema extends z.ZodTypeAny>(
    operation: string,
    schema: Schema,
    raw: unknown,
    invalidMessage: string,
  ): z.infer<Schema> {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, invalidMessage, {
        service: ErrorService.Marketplace,
        operation,
      });
    }
    return parsed.data;
  }

  private static requireSession(operation: string, actor: string): { token: string; pubky: string } {
    const session = MarketplaceSessionService.getActiveSession();
    if (!session) {
      throw Err.auth(
        AuthErrorCode.SESSION_EXPIRED,
        'A marketplace session is required. Approve the marketplace connection on your signer and try again.',
        { service: ErrorService.Marketplace, operation },
      );
    }
    if (session.pubky !== actor) {
      // A session minted for another key must never act for the current user.
      MarketplaceSessionService.clearSession();
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'The marketplace session belongs to a different pubky.', {
        service: ErrorService.Marketplace,
        operation,
      });
    }
    return session;
  }

  /**
   * Only the auth middleware answers 401 (command failures map to 403/404/409/422),
   * so a 401 always means the session is gone server-side — drop the local copy.
   */
  private static throwIfSessionRejected(statusCode: number, operation: string): void {
    if (statusCode !== HttpStatusCode.UNAUTHORIZED) return;
    MarketplaceSessionService.clearSession();
    throw Err.auth(
      AuthErrorCode.SESSION_EXPIRED,
      'The marketplace session expired. Approve the marketplace connection on your signer and try again.',
      { service: ErrorService.Marketplace, operation },
    );
  }

  private static assertTransactionServiceMode(operation: string): void {
    if (!isDurableCommerceMode(getCommerceAdapterMode())) {
      throw Err.client(ClientErrorCode.BAD_REQUEST, 'Marketplace transaction-service commands are disabled.', {
        service: ErrorService.Marketplace,
        operation,
      });
    }
  }
}
