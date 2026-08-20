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

  it.each(['payment.sandbox_advance', 'message.send', 'fulfillment.ship', 'order.cancel_request'] as const)(
    'rejects the sandbox-only command kind %s before sending',
    async (kind) => {
      await establishSession();

      await expect(
        MarketplaceTransactionService.execute(ACTOR, { ...bidCommand(), kind } as never),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

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
