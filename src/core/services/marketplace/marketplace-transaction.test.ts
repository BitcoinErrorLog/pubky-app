import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMarketplaceListingAggregateId } from '@/libs/commerce/transaction-commands';
import { MarketplaceSessionService } from './marketplace-session';
import { MarketplaceTransactionService } from './marketplace-transaction';

const ACTOR = 'y'.repeat(52);
const OTHER_ACTOR = 'b'.repeat(52);
const AGGREGATE_ID = buildMarketplaceListingAggregateId(ACTOR, 'boots_01');
const COMMAND_ID = '00000000-0000-4000-8000-000000000700';

const config = vi.hoisted(() => ({
  mode: 'transaction-service' as string,
}));

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return {
    ...actual,
    getCommerceAdapterMode: () => config.mode,
    getMarketplaceUrl: () => 'http://127.0.0.1:8080',
  };
});

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: { generateAuthTokenFlow: vi.fn() },
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function bidCommand() {
  return {
    version: 1 as const,
    commandId: COMMAND_ID,
    aggregateId: AGGREGATE_ID,
    expectedRevision: 1,
    issuedAt: '2026-08-19T23:00:00.000Z',
    kind: 'auction.place_bid' as const,
    payload: {
      maximumAmount: { amountMinor: 10_000, currency: 'USD', exponent: 2 },
    },
  };
}

async function establishSession(): Promise<void> {
  vi.mocked(fetch).mockResolvedValueOnce(
    jsonResponse(201, {
      token: 'bearer-token',
      pubky: ACTOR,
      capabilities: '',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }),
  );
  await MarketplaceSessionService.establishWithAuthToken(new Uint8Array([1]));
  vi.mocked(fetch).mockClear();
}

describe('MarketplaceTransactionService.execute', () => {
  beforeEach(() => {
    config.mode = 'transaction-service';
    MarketplaceSessionService.clearSession();
  });

  it('sends a snake_case envelope with the session bearer and returns the camelCase response', async () => {
    await establishSession();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        ok: true,
        version: 1,
        command_id: COMMAND_ID,
        aggregate_id: AGGREGATE_ID,
        revision: 2,
        event_ids: ['00000000-0000-4000-8000-000000000701'],
        result: { kind: 'bid', current_price: { amount_minor: 10_000, currency: 'USD', exponent: 2 } },
      }),
    );

    const response = await MarketplaceTransactionService.execute(ACTOR, bidCommand());

    expect(response).toMatchObject({
      ok: true,
      commandId: COMMAND_ID,
      revision: 2,
      result: { kind: 'bid', currentPrice: { amountMinor: 10_000 } },
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8080/v1/commands');
    expect(init.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer bearer-token',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      version: 1,
      command_id: COMMAND_ID,
      aggregate_id: AGGREGATE_ID,
      expected_revision: 1,
      issued_at: '2026-08-19T23:00:00.000Z',
      kind: 'auction.place_bid',
      payload: {
        maximum_amount: { amount_minor: 10_000, currency: 'USD', exponent: 2 },
      },
    });
    // The forgeable sandbox identity header must never reach the real service.
    expect(JSON.stringify(init.headers)).not.toContain('x-pubky-actor');
  });

  it('surfaces command failures as parsed camelCase error responses', async () => {
    await establishSession();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(409, {
        ok: false,
        error: { code: 'REVISION_CONFLICT', message: 'The aggregate changed.', current_revision: 5 },
      }),
    );

    await expect(MarketplaceTransactionService.execute(ACTOR, bidCommand())).resolves.toEqual({
      ok: false,
      error: { code: 'REVISION_CONFLICT', message: 'The aggregate changed.', currentRevision: 5 },
    });
  });

  it('requires an established session before any bytes leave the client', async () => {
    await expect(MarketplaceTransactionService.execute(ACTOR, bidCommand())).rejects.toMatchObject({
      name: 'AppError',
      code: 'SESSION_EXPIRED',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('drops the session and asks for a fresh approval when the service answers 401', async () => {
    await establishSession();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(401, { error: { message: 'The session is invalid or expired.' } }),
    );

    await expect(MarketplaceTransactionService.execute(ACTOR, bidCommand())).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    expect(MarketplaceSessionService.getActiveSession()).toBeNull();
  });

  it('refuses to act for a different pubky than the session was minted for', async () => {
    await establishSession();

    await expect(MarketplaceTransactionService.execute(OTHER_ACTOR, bidCommand())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(MarketplaceSessionService.getActiveSession()).toBeNull();
  });

  it.each([
    'payment.sandbox_advance',
    'message.send',
    'notification.mark_read',
    'notification.preferences.update',
  ] as const)('rejects the sandbox-only command kind %s before sending', async (kind) => {
    await establishSession();

    await expect(
      MarketplaceTransactionService.execute(ACTOR, { ...bidCommand(), kind } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
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
  ] as const)('sends the ported post-purchase command kind %s to the service', async (kind) => {
    await establishSession();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        ok: true,
        version: 1,
        command_id: COMMAND_ID,
        aggregate_id: 'order:00000000-0000-4000-8000-000000000720',
        revision: 3,
        event_ids: ['00000000-0000-4000-8000-000000000721'],
        result: { kind: 'order' },
      }),
    );

    const response = await MarketplaceTransactionService.execute(ACTOR, { ...bidCommand(), kind } as never);

    expect(response).toMatchObject({ ok: true, result: { kind: 'order' } });
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ kind });
  });

  it('fails closed outside transaction-service mode', async () => {
    config.mode = 'sandbox';

    await expect(MarketplaceTransactionService.execute(ACTOR, bidCommand())).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('MarketplaceTransactionService.getReports', () => {
  beforeEach(() => {
    config.mode = 'transaction-service';
    MarketplaceSessionService.clearSession();
  });

  it('reads role-scoped reports with the bearer session and camel-cases the views', async () => {
    await establishSession();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        reports: [
          {
            id: '00000000-0000-4000-8000-000000000900',
            reporter_pubky: ACTOR,
            target_type: 'listing',
            target_id: AGGREGATE_ID,
            reason: 'counterfeit',
            details: 'Brand markings appear inconsistent.',
            state: 'actioned',
            revision: 2,
            created_at: '2026-08-19T23:00:00.000Z',
            updated_at: '2026-08-20T09:00:00.000Z',
          },
        ],
      }),
    );

    await expect(MarketplaceTransactionService.getReports(ACTOR)).resolves.toEqual([
      expect.objectContaining({
        reporterPubky: ACTOR,
        targetType: 'listing',
        state: 'actioned',
        revision: 2,
        updatedAt: '2026-08-20T09:00:00.000Z',
      }),
    ]);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8080/v1/reports');
    expect(init.headers).toEqual({ authorization: 'Bearer bearer-token' });
  });

  it('requires a session', async () => {
    await expect(MarketplaceTransactionService.getReports(ACTOR)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('MarketplaceTransactionService read projections', () => {
  beforeEach(() => {
    config.mode = 'transaction-service';
    MarketplaceSessionService.clearSession();
  });

  const ORDER_ID = '00000000-0000-4000-8000-000000000910';
  const PAYMENT_ID = '00000000-0000-4000-8000-000000000911';
  const RECEIPT_ID = '00000000-0000-4000-8000-000000000912';

  function orderWire(overrides: Record<string, unknown> = {}) {
    return {
      id: ORDER_ID,
      buyer_pubky: ACTOR,
      seller_pubky: OTHER_ACTOR,
      revision: 2,
      state: 'pending_payment',
      lines: [
        {
          listing_aggregate_id: AGGREGATE_ID,
          listing_revision: 1,
          content_hash: 'a'.repeat(64),
          title: 'Boots',
          quantity: 1,
          unit_price: { amount_minor: 12_500, currency: 'USD', exponent: 2 },
          subtotal: { amount_minor: 12_500, currency: 'USD', exponent: 2 },
        },
      ],
      subtotal: { amount_minor: 12_500, currency: 'USD', exponent: 2 },
      shipping: { amount_minor: 1_200, currency: 'USD', exponent: 2 },
      tax: { amount_minor: 1_096, currency: 'USD', exponent: 2 },
      total: { amount_minor: 14_796, currency: 'USD', exponent: 2 },
      guarantee_policy_version: 1,
      payment_id: PAYMENT_ID,
      receipt_id: null,
      cancellation_reason: null,
      shipment: null,
      return_request: null,
      dispute: null,
      external_refund: null,
      reviews: [],
      created_at: '2026-08-20T10:00:00.000Z',
      updated_at: '2026-08-20T10:00:00.000Z',
      ...overrides,
    };
  }

  // The wire payment deliberately has NO locks_bundle_id (ADR-0019 §8).
  function paymentWire() {
    return {
      id: PAYMENT_ID,
      order_id: ORDER_ID,
      buyer_pubky: ACTOR,
      seller_pubky: OTHER_ACTOR,
      revision: 1,
      adapter: 'sandbox',
      state: 'awaiting_entitlement',
      confirmations: 0,
      amount: { amount_minor: 14_796, currency: 'USD', exponent: 2 },
      created_at: '2026-08-20T10:00:00.000Z',
      updated_at: '2026-08-20T10:00:00.000Z',
    };
  }

  it('reads the listing projection with the bearer session and camel-cases the auction state', async () => {
    await establishSession();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        aggregate_id: AGGREGATE_ID,
        seller_pubky: ACTOR,
        listing_id: 'boots_01',
        title: 'Boots',
        listing_revision: 1,
        content_hash: 'a'.repeat(64),
        server_revision: 4,
        state: 'available',
        total_quantity: 5,
        available_quantity: 4,
        reserved_quantity: 1,
        sold_quantity: 0,
        unit_price: { amount_minor: 12_500, currency: 'USD', exponent: 2 },
        sale_format: 'auction',
        auction: {
          starts_at: '2026-08-20T09:00:00.000Z',
          ends_at: '2026-08-21T09:00:00.000Z',
          minimum_increment: { amount_minor: 100, currency: 'USD', exponent: 2 },
          reserve_price: null,
          anti_sniping_window_seconds: 120,
          anti_sniping_extension_seconds: 120,
          status: 'active',
          current_price: { amount_minor: 13_000, currency: 'USD', exponent: 2 },
          leader_pubky: OTHER_ACTOR,
          bid_count: 3,
          reserve_met: true,
        },
        updated_at: '2026-08-20T10:00:00.000Z',
      }),
    );

    const listing = await MarketplaceTransactionService.getListing(ACTOR, AGGREGATE_ID);

    expect(listing).toMatchObject({
      aggregateId: AGGREGATE_ID,
      serverRevision: 4,
      state: 'available',
      auction: { currentPrice: { amountMinor: 13_000 }, leaderPubky: OTHER_ACTOR, bidCount: 3, reserveMet: true },
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:8080/v1/listings/${encodeURIComponent(AGGREGATE_ID)}`);
    expect(init.headers).toEqual({ authorization: 'Bearer bearer-token' });
  });

  it('returns null for an unregistered listing (service 404)', async () => {
    await establishSession();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(404, { ok: false, error: { code: 'NOT_FOUND', message: 'The listing was not found.' } }),
    );

    await expect(MarketplaceTransactionService.getListing(ACTOR, AGGREGATE_ID)).resolves.toBeNull();
  });

  it('reads participant offers and maps the negotiation view', async () => {
    await establishSession();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        offers: [
          {
            id: '00000000-0000-4000-8000-000000000920',
            aggregate_id: 'offer:00000000-0000-4000-8000-000000000920',
            listing_aggregate_id: AGGREGATE_ID,
            buyer_pubky: ACTOR,
            seller_pubky: OTHER_ACTOR,
            revision: 2,
            state: 'countered',
            offered_by: OTHER_ACTOR,
            amount: { amount_minor: 11_000, currency: 'USD', exponent: 2 },
            quantity: 1,
            message: 'Meet in the middle?',
            history: [],
            expires_at: '2026-08-21T10:00:00.000Z',
            created_at: '2026-08-20T10:00:00.000Z',
            updated_at: '2026-08-20T11:00:00.000Z',
          },
        ],
      }),
    );

    await expect(MarketplaceTransactionService.getOffers(ACTOR)).resolves.toEqual([
      expect.objectContaining({
        aggregateId: 'offer:00000000-0000-4000-8000-000000000920',
        revision: 2,
        state: 'countered',
        offeredBy: OTHER_ACTOR,
        amount: { amountMinor: 11_000, currency: 'USD', exponent: 2 },
      }),
    ]);
    const [url] = vi.mocked(fetch).mock.calls[0] as [string];
    expect(url).toBe('http://127.0.0.1:8080/v1/offers');
  });

  it('reads orders with the embedded payment and post-purchase sub-objects, redactions honored', async () => {
    await establishSession();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        orders: [
          orderWire({
            state: 'disputed',
            payment: paymentWire(),
            shipment: {
              carrier: 'DHL',
              tracking_number: 'JD014600003RU',
              state: 'delivered',
              shipped_at: '2026-08-20T11:00:00.000Z',
              delivered_at: '2026-08-20T12:00:00.000Z',
            },
            dispute: {
              state: 'open',
              opened_by: ACTOR,
              reason: 'Item arrived damaged.',
              requested_remedy: 'refund',
              resolution: null,
              rationale: null,
              evidence_count: 2,
              opened_at: '2026-08-20T13:00:00.000Z',
              resolved_at: null,
            },
          }),
        ],
      }),
    );

    const orders = await MarketplaceTransactionService.getOrders(ACTOR);

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      id: ORDER_ID,
      revision: 2,
      state: 'disputed',
      payment: { id: PAYMENT_ID, state: 'awaiting_entitlement', adapter: 'sandbox' },
      shipment: { carrier: 'DHL', trackingNumber: 'JD014600003RU', state: 'delivered' },
      dispute: { state: 'open', requestedRemedy: 'refund', evidenceCount: 2 },
      receiptId: null,
    });
    // Redactions: the service never serves these; the parsed view must not
    // resurrect them.
    expect(orders[0]).not.toHaveProperty('deliveryAddress');
    expect(orders[0].payment).not.toHaveProperty('locksBundleId');
    expect(orders[0].dispute).not.toHaveProperty('evidence');
  });

  it('reads a single payment and returns null for foreign/absent payments', async () => {
    await establishSession();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, paymentWire()))
      .mockResolvedValueOnce(
        jsonResponse(404, { ok: false, error: { code: 'NOT_FOUND', message: 'The payment was not found.' } }),
      );

    await expect(MarketplaceTransactionService.getPayment(ACTOR, PAYMENT_ID)).resolves.toMatchObject({
      id: PAYMENT_ID,
      orderId: ORDER_ID,
      revision: 1,
    });
    await expect(MarketplaceTransactionService.getPayment(ACTOR, PAYMENT_ID)).resolves.toBeNull();
  });

  it('reads a receipt with its integrity hash', async () => {
    await establishSession();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        id: RECEIPT_ID,
        order_id: ORDER_ID,
        payment_id: PAYMENT_ID,
        issuer_pubky: OTHER_ACTOR,
        recipient_pubky: ACTOR,
        total: { amount_minor: 14_796, currency: 'USD', exponent: 2 },
        content_hash: 'b'.repeat(64),
        issued_at: '2026-08-20T12:00:00.000Z',
      }),
    );

    await expect(MarketplaceTransactionService.getReceipt(ACTOR, RECEIPT_ID)).resolves.toMatchObject({
      id: RECEIPT_ID,
      contentHash: 'b'.repeat(64),
      total: { amountMinor: 14_796 },
    });
  });

  it('reads recipient notifications that carry no revision', async () => {
    await establishSession();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        notifications: [
          {
            id: '00000000-0000-4000-8000-000000000930',
            recipient_pubky: ACTOR,
            actor_pubky: OTHER_ACTOR,
            type: 'order_shipped',
            aggregate_id: `order:${ORDER_ID}`,
            created_at: '2026-08-20T11:00:00.000Z',
            read_at: null,
          },
        ],
      }),
    );

    const notifications = await MarketplaceTransactionService.getNotifications(ACTOR);

    expect(notifications).toEqual([
      expect.objectContaining({ type: 'order_shipped', aggregateId: `order:${ORDER_ID}`, readAt: null }),
    ]);
    expect(notifications[0].revision).toBeUndefined();
  });

  it('requires a session for every projection read', async () => {
    await expect(MarketplaceTransactionService.getListing(ACTOR, AGGREGATE_ID)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    await expect(MarketplaceTransactionService.getOffers(ACTOR)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await expect(MarketplaceTransactionService.getOrders(ACTOR)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await expect(MarketplaceTransactionService.getPayment(ACTOR, PAYMENT_ID)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    await expect(MarketplaceTransactionService.getReceipt(ACTOR, RECEIPT_ID)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    await expect(MarketplaceTransactionService.getNotifications(ACTOR)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed outside transaction-service mode', async () => {
    config.mode = 'sandbox';

    await expect(MarketplaceTransactionService.getOrders(ACTOR)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('drops the session when a projection read answers 401', async () => {
    await establishSession();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(401, { error: { message: 'The session is invalid or expired.' } }),
    );

    await expect(MarketplaceTransactionService.getOrders(ACTOR)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(MarketplaceSessionService.getActiveSession()).toBeNull();
  });

  describe('dispute adjudication reads', () => {
    function disputedOrderWire() {
      return orderWire({
        state: 'disputed',
        dispute: {
          state: 'open',
          opened_by: ACTOR,
          reason: 'Item arrived damaged.',
          requested_remedy: 'refund',
          resolution: null,
          rationale: null,
          evidence_count: 2,
          opened_at: '2026-08-20T13:00:00.000Z',
          resolved_at: null,
        },
      });
    }

    it('reads the moderator dispute queue and camel-cases the order projections', async () => {
      await establishSession();
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { disputes: [disputedOrderWire()] }));

      const disputes = await MarketplaceTransactionService.getDisputes(ACTOR);

      expect(disputes).toHaveLength(1);
      expect(disputes![0]).toMatchObject({
        id: ORDER_ID,
        revision: 2,
        state: 'disputed',
        dispute: { state: 'open', reason: 'Item arrived damaged.', evidenceCount: 2 },
      });
      // The queue is an order projection: it carries only the content-free
      // evidence count, never bodies.
      expect(disputes![0].dispute).not.toHaveProperty('evidence');
      const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://127.0.0.1:8080/v1/disputes');
      expect(init.headers).toEqual({ authorization: 'Bearer bearer-token' });
    });

    it('returns null when the service refuses the queue with 403 (not a configured moderator)', async () => {
      await establishSession();
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(403, {
          ok: false,
          error: { code: 'UNAUTHORIZED', message: 'Only a configured moderator may read the dispute queue.' },
        }),
      );

      // Null, not [] — the caller must keep the queue absent rather than
      // render an empty-looking one for a non-moderator.
      await expect(MarketplaceTransactionService.getDisputes(ACTOR)).resolves.toBeNull();
    });

    it('reads a single order projection by id', async () => {
      await establishSession();
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, disputedOrderWire()));

      const order = await MarketplaceTransactionService.getOrder(ACTOR, ORDER_ID);

      expect(order).toMatchObject({ id: ORDER_ID, revision: 2, state: 'disputed' });
      const [url] = vi.mocked(fetch).mock.calls[0] as [string];
      expect(url).toBe(`http://127.0.0.1:8080/v1/orders/${ORDER_ID}`);
    });

    it('returns null for an absent or foreign order (service 404)', async () => {
      await establishSession();
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(404, { ok: false, error: { code: 'NOT_FOUND', message: 'The order was not found.' } }),
      );

      await expect(MarketplaceTransactionService.getOrder(ACTOR, ORDER_ID)).resolves.toBeNull();
    });

    it('reads the evidence case file with bodies through the scoped endpoint', async () => {
      await establishSession();
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(200, {
          order_id: ORDER_ID,
          evidence: [
            {
              id: '00000000-0000-4000-8000-000000000941',
              submitter_pubky: ACTOR,
              body: 'Photo hashes of the damaged parcel: abc123.',
              body_bytes: 43,
              created_at: '2026-08-20T14:00:00.000Z',
            },
            {
              id: '00000000-0000-4000-8000-000000000940',
              submitter_pubky: OTHER_ACTOR,
              body: 'The parcel left our warehouse intact.',
              body_bytes: 37,
              created_at: '2026-08-20T13:30:00.000Z',
            },
          ],
        }),
      );

      const caseFile = await MarketplaceTransactionService.getOrderEvidence(ACTOR, ORDER_ID);

      expect(caseFile).toMatchObject({ orderId: ORDER_ID });
      expect(caseFile!.evidence).toEqual([
        expect.objectContaining({
          submitterPubky: ACTOR,
          body: 'Photo hashes of the damaged parcel: abc123.',
          bodyBytes: 43,
        }),
        expect.objectContaining({
          submitterPubky: OTHER_ACTOR,
          body: 'The parcel left our warehouse intact.',
          bodyBytes: 37,
        }),
      ]);
      const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://127.0.0.1:8080/v1/orders/${ORDER_ID}/evidence`);
      expect(init.headers).toEqual({ authorization: 'Bearer bearer-token' });
    });

    it('returns null for a stranger or absent order on the evidence read (indistinguishable 404)', async () => {
      await establishSession();
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse(404, { ok: false, error: { code: 'NOT_FOUND', message: 'The order was not found.' } }),
      );

      await expect(MarketplaceTransactionService.getOrderEvidence(ACTOR, ORDER_ID)).resolves.toBeNull();
    });

    it('requires a session for every adjudication read', async () => {
      await expect(MarketplaceTransactionService.getDisputes(ACTOR)).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      });
      await expect(MarketplaceTransactionService.getOrder(ACTOR, ORDER_ID)).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      });
      await expect(MarketplaceTransactionService.getOrderEvidence(ACTOR, ORDER_ID)).rejects.toMatchObject({
        code: 'SESSION_EXPIRED',
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('fails closed outside transaction-service mode', async () => {
      config.mode = 'sandbox';

      await expect(MarketplaceTransactionService.getDisputes(ACTOR)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      await expect(MarketplaceTransactionService.getOrder(ACTOR, ORDER_ID)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      await expect(MarketplaceTransactionService.getOrderEvidence(ACTOR, ORDER_ID)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
