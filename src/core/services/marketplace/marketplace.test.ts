import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMarketplaceListingAggregateId } from '@/libs/commerce/transaction-commands';
import { MarketplaceGatewayService } from './marketplace';

const SELLER = 'y'.repeat(52);
const AGGREGATE_ID = buildMarketplaceListingAggregateId(SELLER, 'boots_01');
const config = vi.hoisted(() => ({
  mode: 'sandbox' as 'sandbox' | 'unavailable',
}));

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return {
    ...actual,
    getCommerceAdapterMode: () => config.mode,
    getMarketplaceUrl: () => 'http://localhost:3100',
  };
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function command() {
  return {
    version: 1 as const,
    commandId: '00000000-0000-4000-8000-000000000700',
    aggregateId: AGGREGATE_ID,
    expectedRevision: 1,
    issuedAt: '2026-08-19T23:00:00.000Z',
    kind: 'auction.place_bid' as const,
    payload: {
      maximumAmount: { amountMinor: 10_000, currency: 'USD', exponent: 2 },
    },
  };
}

describe('MarketplaceGatewayService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.mode = 'sandbox';
  });

  it('executes a closed sandbox command with the Pubky actor header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        ok: true,
        version: 1,
        commandId: command().commandId,
        aggregateId: AGGREGATE_ID,
        revision: 2,
        eventIds: ['00000000-0000-4000-8000-000000000701'],
        result: { kind: 'bid' },
      }),
    );

    await expect(MarketplaceGatewayService.execute(SELLER, command())).resolves.toMatchObject({
      ok: true,
      result: { kind: 'bid' },
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3100/v1/commands',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-pubky-actor': SELLER }),
      }),
    );
  });

  it('fails closed when sandbox mode is not explicit', async () => {
    config.mode = 'unavailable';

    await expect(MarketplaceGatewayService.execute(SELLER, command())).rejects.toMatchObject({
      name: 'AppError',
      code: 'BAD_REQUEST',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null for an unknown authoritative listing projection', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(404, { error: { code: 'NOT_FOUND' } }));

    await expect(MarketplaceGatewayService.getListing(AGGREGATE_ID)).resolves.toBeNull();
  });

  it('validates private conversation and notification query projections', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(200, {
          conversations: [
            {
              id: `conversation:${SELLER}_${'b'.repeat(52)}_boots_01`,
              listingAggregateId: AGGREGATE_ID,
              sellerPubky: SELLER,
              buyerPubky: 'b'.repeat(52),
              revision: 1,
              lastMessageAt: '2026-08-19T23:00:00.000Z',
              messages: [
                {
                  id: '00000000-0000-4000-8000-000000000930',
                  senderPubky: 'b'.repeat(52),
                  recipientPubky: SELLER,
                  text: 'Hello',
                  createdAt: '2026-08-19T23:00:00.000Z',
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          notifications: [
            {
              id: '00000000-0000-4000-8000-000000000931',
              revision: 1,
              recipientPubky: SELLER,
              actorPubky: 'b'.repeat(52),
              type: 'message_received',
              aggregateId: `conversation:${SELLER}_${'b'.repeat(52)}_boots_01`,
              createdAt: '2026-08-19T23:00:00.000Z',
              readAt: null,
            },
          ],
        }),
      );

    await expect(MarketplaceGatewayService.getConversations(SELLER)).resolves.toHaveLength(1);
    await expect(MarketplaceGatewayService.getNotifications(SELLER)).resolves.toHaveLength(1);
  });

  it('validates revisioned notification preferences', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(200, {
        ownerPubky: SELLER,
        revision: 2,
        messages: true,
        offers: false,
        bids: true,
        auctions: true,
        updatedAt: '2026-08-19T23:00:00.000Z',
      }),
    );

    await expect(MarketplaceGatewayService.getNotificationPreferences(SELLER)).resolves.toMatchObject({
      revision: 2,
      offers: false,
    });
  });
});
