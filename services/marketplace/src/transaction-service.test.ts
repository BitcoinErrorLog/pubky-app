import { describe, expect, it } from 'vitest';
import {
  buildMarketplaceCheckoutAggregateId,
  buildMarketplaceConversationAggregateId,
  buildMarketplaceListingAggregateId,
  buildMarketplaceOfferAggregateId,
  buildMarketplacePaymentAggregateId,
} from './contracts';
import { InMemoryMarketplaceRepository, MarketplaceTransactionService } from './transaction-service';

const SELLER = 'y'.repeat(52);
const BUYER = 'b'.repeat(52);
const OTHER_BUYER = 'n'.repeat(52);
const AGGREGATE_ID = buildMarketplaceListingAggregateId(SELLER, 'boots_01');
const NOW = new Date('2026-08-19T22:00:00.000Z');
const REGISTER_COMMAND_ID = '018f47d2-6a27-7c23-a49d-6b21bb770120';

function registerCommand(quantity = 1, overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    commandId: REGISTER_COMMAND_ID,
    aggregateId: AGGREGATE_ID,
    expectedRevision: 0,
    issuedAt: NOW.toISOString(),
    kind: 'listing.register',
    payload: {
      sellerPubky: SELLER,
      listingId: 'boots_01',
      listingRevision: 1,
      contentHash: 'a'.repeat(64),
      quantity,
      unitPrice: { amountMinor: 12_500, currency: 'USD', exponent: 2 },
    },
    ...overrides,
  };
}

function registerAuctionCommand() {
  return registerCommand(1, {
    commandId: '00000000-0000-4000-8000-000000000600',
    payload: {
      ...registerCommand().payload,
      listingRevision: 1,
      unitPrice: { amountMinor: 4_500, currency: 'USD', exponent: 2 },
      saleFormat: 'auction',
      auctionTerms: {
        startsAt: NOW.toISOString(),
        endsAt: new Date(NOW.getTime() + 10 * 60 * 1_000).toISOString(),
        minimumIncrement: { amountMinor: 500, currency: 'USD', exponent: 2 },
        reservePrice: { amountMinor: 6_000, currency: 'USD', exponent: 2 },
        antiSnipingWindowSeconds: 60,
        antiSnipingExtensionSeconds: 120,
      },
    },
  });
}

function reserveCommand(index = 1, quantity = 1, expectedRevision = 1) {
  return {
    version: 1,
    commandId: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    aggregateId: AGGREGATE_ID,
    expectedRevision,
    issuedAt: NOW.toISOString(),
    kind: 'inventory.reserve',
    payload: {
      quantity,
      reservationTtlSeconds: 600,
    },
  };
}

function createOfferCommand(quantity = 1) {
  return {
    version: 1,
    commandId: '00000000-0000-4000-8000-000000000500',
    aggregateId: AGGREGATE_ID,
    expectedRevision: 1,
    issuedAt: NOW.toISOString(),
    kind: 'offer.create',
    payload: {
      amount: { amountMinor: 10_000, currency: 'USD', exponent: 2 },
      quantity,
      expiresInSeconds: 3_600,
      message: 'Would you take this?',
    },
  };
}

function offerAction(
  kind: 'offer.accept' | 'offer.reject' | 'offer.withdraw',
  expectedRevision: number,
  commandId: string,
) {
  const offerId = createOfferCommand().commandId;
  return {
    version: 1,
    commandId,
    aggregateId: buildMarketplaceOfferAggregateId(offerId),
    expectedRevision,
    issuedAt: NOW.toISOString(),
    kind,
    payload: { offerId },
  };
}

function counterOfferCommand(expectedRevision = 1) {
  const offerId = createOfferCommand().commandId;
  return {
    version: 1,
    commandId: '00000000-0000-4000-8000-000000000501',
    aggregateId: buildMarketplaceOfferAggregateId(offerId),
    expectedRevision,
    issuedAt: NOW.toISOString(),
    kind: 'offer.counter',
    payload: {
      offerId,
      amount: { amountMinor: 11_000, currency: 'USD', exponent: 2 },
      quantity: 1,
      expiresInSeconds: 3_600,
      message: 'Meet me here.',
    },
  };
}

function placeBidCommand(actorIndex: number, maximumMinor: number, expectedRevision: number) {
  return {
    version: 1,
    commandId: `00000000-0000-4000-8001-${actorIndex.toString().padStart(12, '0')}`,
    aggregateId: AGGREGATE_ID,
    expectedRevision,
    issuedAt: NOW.toISOString(),
    kind: 'auction.place_bid',
    payload: {
      maximumAmount: { amountMinor: maximumMinor, currency: 'USD', exponent: 2 },
    },
  };
}

function messageCommand(sender: string, recipient: string, expectedRevision: number, commandId: string, text: string) {
  const buyer = sender === SELLER ? recipient : sender;
  return {
    version: 1,
    commandId,
    aggregateId: buildMarketplaceConversationAggregateId(SELLER, buyer, 'boots_01'),
    expectedRevision,
    issuedAt: NOW.toISOString(),
    kind: 'message.send',
    payload: {
      listingAggregateId: AGGREGATE_ID,
      recipientPubky: recipient,
      text,
      attachmentIds: [] as string[],
    },
  };
}

function closeAuctionCommand(expectedRevision: number, commandNumber = 950) {
  return {
    version: 1,
    commandId: `00000000-0000-4000-8000-${commandNumber.toString().padStart(12, '0')}`,
    aggregateId: AGGREGATE_ID,
    expectedRevision,
    issuedAt: NOW.toISOString(),
    kind: 'auction.close',
    payload: {},
  };
}

function notificationPreferencesCommand(expectedRevision: number, messages: boolean, commandNumber = 960) {
  return {
    version: 1,
    commandId: `00000000-0000-4000-8000-${commandNumber.toString().padStart(12, '0')}`,
    aggregateId: `notification_preferences:${SELLER}`,
    expectedRevision,
    issuedAt: NOW.toISOString(),
    kind: 'notification.preferences.update',
    payload: { messages, offers: true, bids: true, auctions: true },
  };
}

function checkoutCommand() {
  const commandId = '00000000-0000-4000-8000-000000001000';
  return {
    version: 1,
    commandId,
    aggregateId: buildMarketplaceCheckoutAggregateId(commandId),
    expectedRevision: 0,
    issuedAt: NOW.toISOString(),
    kind: 'checkout.create',
    payload: {
      lines: [{ listingAggregateId: AGGREGATE_ID, expectedRevision: 1, quantity: 1 }],
      deliveryAddress: {
        name: 'Alice Buyer',
        line1: '1 Market Street',
        line2: '',
        city: 'New York',
        region: 'NY',
        postalCode: '10001',
        countryCode: 'US',
      },
      guaranteePolicyVersion: 1,
    },
  };
}

function paymentCommand(
  paymentId: string,
  expectedRevision: number,
  target: 'detected' | 'confirmed' | 'expired' | 'manual_review',
  confirmations: number,
  commandNumber: number,
) {
  return {
    version: 1,
    commandId: `00000000-0000-4000-8000-${commandNumber.toString().padStart(12, '0')}`,
    aggregateId: buildMarketplacePaymentAggregateId(paymentId),
    expectedRevision,
    issuedAt: NOW.toISOString(),
    kind: 'payment.sandbox_advance',
    payload: { paymentId, target, confirmations },
  };
}

function createService() {
  const repository = new InMemoryMarketplaceRepository();
  return {
    repository,
    service: new MarketplaceTransactionService(repository, () => new Date(NOW)),
  };
}

describe('MarketplaceTransactionService', () => {
  it('registers seller-owned inventory at revision one', async () => {
    const { repository, service } = createService();

    const result = await service.execute(SELLER, registerCommand());

    expect(result).toMatchObject({
      ok: true,
      aggregateId: AGGREGATE_ID,
      revision: 1,
      result: {
        kind: 'listing',
        listing: {
          availableQuantity: 1,
          reservedQuantity: 0,
          serverRevision: 1,
          state: 'available',
        },
      },
    });
    expect(repository.getEvents()).toHaveLength(1);
  });

  it('rejects registration by anyone other than the public listing seller', async () => {
    const { service } = createService();

    await expect(service.execute(BUYER, registerCommand())).resolves.toEqual({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Only the listing seller may register inventory.',
      },
    });
  });

  it('returns the exact stored result for an idempotent replay', async () => {
    const { repository, service } = createService();
    const command = registerCommand();

    const first = await service.execute(SELLER, command);
    const replay = await service.execute(SELLER, command);

    expect(replay).toEqual(first);
    expect(repository.getEvents()).toHaveLength(1);
  });

  it('rejects changed input under an already accepted command id', async () => {
    const { service } = createService();
    await service.execute(SELLER, registerCommand());

    const changed = registerCommand(2);

    await expect(service.execute(SELLER, changed)).resolves.toEqual({
      ok: false,
      error: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'The command id was already used with different input.',
      },
    });
  });

  it('allows exactly one of 100 concurrent buyers to reserve one unit', async () => {
    const { repository, service } = createService();
    await service.execute(SELLER, registerCommand());

    const results = await Promise.all(
      Array.from({ length: 100 }, (_, index) => service.execute(BUYER, reserveCommand(index + 1))),
    );
    const accepted = results.filter(({ ok }) => ok);
    const rejected = results.filter(({ ok }) => !ok);

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(99);
    expect(rejected.every((result) => !result.ok && result.error.code === 'REVISION_CONFLICT')).toBe(true);
    expect(repository.getListing(AGGREGATE_ID)).toMatchObject({
      availableQuantity: 0,
      reservedQuantity: 1,
      serverRevision: 2,
      state: 'reserved',
    });
    expect(repository.getEvents()).toHaveLength(2);
  });

  it('uses server time for reservation expiry', async () => {
    const { service } = createService();
    await service.execute(SELLER, registerCommand());

    const result = await service.execute(BUYER, reserveCommand());

    expect(result).toMatchObject({
      ok: true,
      result: {
        kind: 'reservation',
        reservation: {
          createdAt: '2026-08-19T22:00:00.000Z',
          expiresAt: '2026-08-19T22:10:00.000Z',
        },
      },
    });
  });

  it('rejects seller self-reservation and stale buyer revisions', async () => {
    const { service } = createService();
    await service.execute(SELLER, registerCommand());

    await expect(service.execute(SELLER, reserveCommand())).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
    await expect(service.execute(BUYER, reserveCommand(2, 1, 0))).resolves.toMatchObject({
      ok: false,
      error: { code: 'REVISION_CONFLICT', currentRevision: 1 },
    });
  });

  it('prevents a seller update from reducing total quantity below reservations', async () => {
    const { service } = createService();
    await service.execute(SELLER, registerCommand(2));
    await service.execute(BUYER, reserveCommand(1, 2));
    const update = registerCommand(1, {
      commandId: '018f47d2-6a27-7c23-a49d-6b21bb770121',
      expectedRevision: 2,
      payload: {
        ...registerCommand(1).payload,
        listingRevision: 2,
      },
    });

    await expect(service.execute(SELLER, update)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVARIANT_VIOLATION', currentRevision: 2 },
    });
  });

  it('returns redacted validation issues for malformed commands', async () => {
    const { service } = createService();

    const result = await service.execute('not-a-pubky', {
      ...registerCommand(),
      privateAddress: 'secret-address',
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_COMMAND',
        issues: expect.any(Array),
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret-address');
  });

  it('supports private offer, counteroffer, and atomic acceptance history', async () => {
    const { repository, service } = createService();
    await service.execute(SELLER, registerCommand(2));

    const created = await service.execute(BUYER, createOfferCommand());
    const countered = await service.execute(SELLER, counterOfferCommand());
    const accepted = await service.execute(
      BUYER,
      offerAction('offer.accept', 2, '00000000-0000-4000-8000-000000000502'),
    );

    expect(created).toMatchObject({
      ok: true,
      revision: 1,
      result: { kind: 'offer', offer: { buyerPubky: BUYER, sellerPubky: SELLER, state: 'pending' } },
    });
    expect(countered).toMatchObject({
      ok: true,
      revision: 2,
      result: { kind: 'offer', offer: { state: 'countered', offeredBy: SELLER, amount: { amountMinor: 11_000 } } },
    });
    expect(accepted).toMatchObject({
      ok: true,
      revision: 3,
      eventIds: expect.arrayContaining([expect.any(String), expect.any(String)]),
      result: {
        kind: 'accepted_offer',
        offer: { state: 'accepted', revision: 3 },
        listing: { availableQuantity: 1, reservedQuantity: 1, serverRevision: 2 },
        reservation: { buyerPubky: BUYER, quantity: 1 },
      },
    });
    expect(repository.getOffer(createOfferCommand().commandId)?.history.map(({ action }) => action)).toEqual([
      'created',
      'countered',
      'accepted',
    ]);
  });

  it('enforces participant roles for counter, reject, and withdraw', async () => {
    const { service } = createService();
    await service.execute(SELLER, registerCommand());
    await service.execute(BUYER, createOfferCommand());

    await expect(service.execute(BUYER, counterOfferCommand())).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
    await expect(service.execute(OTHER_BUYER, counterOfferCommand())).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
    await expect(
      service.execute(SELLER, offerAction('offer.withdraw', 1, '00000000-0000-4000-8000-000000000503')),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
    await expect(
      service.execute(BUYER, offerAction('offer.reject', 1, '00000000-0000-4000-8000-000000000504')),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('supports rejection by the recipient and withdrawal by the current author', async () => {
    const rejectedService = createService().service;
    await rejectedService.execute(SELLER, registerCommand());
    await rejectedService.execute(BUYER, createOfferCommand());
    await expect(
      rejectedService.execute(SELLER, offerAction('offer.reject', 1, '00000000-0000-4000-8000-000000000505')),
    ).resolves.toMatchObject({ ok: true, result: { offer: { state: 'rejected' } } });

    const withdrawnService = createService().service;
    await withdrawnService.execute(SELLER, registerCommand());
    await withdrawnService.execute(BUYER, createOfferCommand());
    await expect(
      withdrawnService.execute(BUYER, offerAction('offer.withdraw', 1, '00000000-0000-4000-8000-000000000506')),
    ).resolves.toMatchObject({ ok: true, result: { offer: { state: 'withdrawn' } } });
  });

  it('does not accept an offer after another buyer reserves the inventory', async () => {
    const { service } = createService();
    await service.execute(SELLER, registerCommand());
    await service.execute(BUYER, createOfferCommand());
    await service.execute(OTHER_BUYER, reserveCommand(20));

    await expect(
      service.execute(SELLER, offerAction('offer.accept', 1, '00000000-0000-4000-8000-000000000507')),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INSUFFICIENT_INVENTORY' },
    });
  });

  it('rejects actions after server-time offer expiry', async () => {
    let now = new Date(NOW);
    const repository = new InMemoryMarketplaceRepository();
    const service = new MarketplaceTransactionService(repository, () => new Date(now));
    await service.execute(SELLER, registerCommand());
    await service.execute(BUYER, createOfferCommand());
    now = new Date(NOW.getTime() + 3_601_000);

    await expect(service.execute(SELLER, counterOfferCommand())).resolves.toMatchObject({
      ok: false,
      error: { code: 'OFFER_EXPIRED' },
    });
  });

  it('applies deterministic proxy bidding and reserve status', async () => {
    const { repository, service } = createService();
    await service.execute(SELLER, registerAuctionCommand());

    const first = await service.execute(BUYER, placeBidCommand(1, 10_000, 1));
    const second = await service.execute(OTHER_BUYER, placeBidCommand(2, 8_000, 2));

    expect(first).toMatchObject({
      ok: true,
      result: {
        kind: 'bid',
        listing: {
          auction: {
            currentPrice: { amountMinor: 4_500 },
            leaderPubky: BUYER,
            reserveMet: false,
            bidCount: 1,
          },
        },
      },
    });
    expect(second).toMatchObject({
      ok: true,
      revision: 3,
      result: {
        kind: 'bid',
        listing: {
          auction: {
            currentPrice: { amountMinor: 8_500 },
            leaderPubky: BUYER,
            reserveMet: true,
            bidCount: 2,
          },
        },
      },
    });
    expect(repository.getBidsForListing(AGGREGATE_ID)).toHaveLength(2);
  });

  it('uses first accepted sequence as the proxy-bid tie breaker', async () => {
    const { repository, service } = createService();
    await service.execute(SELLER, registerAuctionCommand());
    await service.execute(BUYER, placeBidCommand(1, 10_000, 1));
    await service.execute(OTHER_BUYER, placeBidCommand(2, 10_000, 2));

    expect(repository.getListing(AGGREGATE_ID)?.auction).toMatchObject({
      currentPrice: { amountMinor: 10_000 },
      leaderPubky: BUYER,
    });
  });

  it('rejects seller, low, stale, and post-close bids', async () => {
    let now = new Date(NOW);
    const repository = new InMemoryMarketplaceRepository();
    const service = new MarketplaceTransactionService(repository, () => new Date(now));
    await service.execute(SELLER, registerAuctionCommand());

    await expect(service.execute(SELLER, placeBidCommand(1, 10_000, 1))).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
    await expect(service.execute(BUYER, placeBidCommand(2, 4_500, 1))).resolves.toMatchObject({
      ok: false,
      error: { code: 'BID_TOO_LOW' },
    });
    await service.execute(BUYER, placeBidCommand(3, 10_000, 1));
    await expect(service.execute(OTHER_BUYER, placeBidCommand(4, 11_000, 1))).resolves.toMatchObject({
      ok: false,
      error: { code: 'REVISION_CONFLICT', currentRevision: 2 },
    });
    now = new Date(NOW.getTime() + 11 * 60 * 1_000);
    await expect(service.execute(OTHER_BUYER, placeBidCommand(5, 11_000, 2))).resolves.toMatchObject({
      ok: false,
      error: { code: 'AUCTION_CLOSED' },
    });
  });

  it('extends an auction when a valid bid lands inside the anti-sniping window', async () => {
    let now = new Date(NOW);
    const repository = new InMemoryMarketplaceRepository();
    const service = new MarketplaceTransactionService(repository, () => new Date(now));
    await service.execute(SELLER, registerAuctionCommand());
    now = new Date(NOW.getTime() + 9 * 60 * 1_000 + 30_000);

    await service.execute(BUYER, placeBidCommand(1, 10_000, 1));

    expect(repository.getListing(AGGREGATE_ID)?.auction?.endsAt).toBe(new Date(now.getTime() + 120_000).toISOString());
  });

  it('stores participant-only listing messages with immutable revisions', async () => {
    const { repository, service } = createService();
    await service.execute(SELLER, registerCommand());

    const first = await service.execute(
      BUYER,
      messageCommand(BUYER, SELLER, 0, '00000000-0000-4000-8000-000000000900', 'Is this still available?'),
    );
    const reply = await service.execute(
      SELLER,
      messageCommand(SELLER, BUYER, 1, '00000000-0000-4000-8000-000000000901', 'Yes, it is.'),
    );

    expect(first).toMatchObject({ ok: true, revision: 1, result: { kind: 'message' } });
    expect(reply).toMatchObject({
      ok: true,
      revision: 2,
      result: { conversation: { messages: [{ text: 'Is this still available?' }, { text: 'Yes, it is.' }] } },
    });
    expect(service.getParticipantConversations(BUYER)).toHaveLength(1);
    expect(service.getParticipantConversations(SELLER)).toHaveLength(1);
    expect(service.getParticipantConversations(OTHER_BUYER)).toEqual([]);
    expect(repository.getEvents().filter(({ kind }) => kind === 'message.sent')).toHaveLength(2);
  });

  it('rejects unrelated message recipients and stale conversation revisions', async () => {
    const { service } = createService();
    await service.execute(SELLER, registerCommand());

    await expect(
      service.execute(BUYER, messageCommand(BUYER, OTHER_BUYER, 0, '00000000-0000-4000-8000-000000000902', 'Private')),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });

    await service.execute(BUYER, messageCommand(BUYER, SELLER, 0, '00000000-0000-4000-8000-000000000903', 'First'));
    await expect(
      service.execute(BUYER, messageCommand(BUYER, SELLER, 0, '00000000-0000-4000-8000-000000000904', 'Stale')),
    ).resolves.toMatchObject({ ok: false, error: { code: 'REVISION_CONFLICT', currentRevision: 1 } });
  });

  it('validates image signatures and binds one-use private attachments to messages', async () => {
    const { service } = createService();
    await service.execute(SELLER, registerCommand());
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0x02]);
    const stored = service.storeAttachment(BUYER, SELLER, 'image/jpeg', bytes);
    expect(stored).toMatchObject({
      ok: true,
      attachment: {
        senderPubky: BUYER,
        recipientPubky: SELLER,
        mimeType: 'image/jpeg',
        byteSize: 5,
      },
    });
    if (!stored.ok) return;
    const command = messageCommand(BUYER, SELLER, 0, '00000000-0000-4000-8000-000000000906', 'Photo attached');
    command.payload.attachmentIds = [stored.attachment.id];

    await expect(service.execute(BUYER, command)).resolves.toMatchObject({
      ok: true,
      result: {
        kind: 'message',
        message: {
          attachments: [{ id: stored.attachment.id, contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) }],
        },
      },
    });
    expect(service.getAttachment(BUYER, stored.attachment.id)?.bytes).toEqual(bytes);
    expect(service.getAttachment(SELLER, stored.attachment.id)?.bytes).toEqual(bytes);
    expect(service.getAttachment(OTHER_BUYER, stored.attachment.id)).toBeNull();

    const reused = messageCommand(BUYER, SELLER, 1, '00000000-0000-4000-8000-000000000907', 'Reuse');
    reused.payload.attachmentIds = [stored.attachment.id];
    await expect(service.execute(BUYER, reused)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_COMMAND' },
    });
  });

  it('rejects spoofed and oversized attachment payloads', () => {
    const { service } = createService();

    expect(service.storeAttachment(BUYER, SELLER, 'image/jpeg', new Uint8Array([1, 2, 3]))).toMatchObject({
      ok: false,
      code: 'INVALID_ATTACHMENT',
    });
    expect(
      service.storeAttachment(BUYER, SELLER, 'image/svg+xml', new Uint8Array([0x3c, 0x73, 0x76, 0x67])),
    ).toMatchObject({
      ok: false,
      code: 'INVALID_ATTACHMENT',
    });
    expect(service.storeAttachment(BUYER, SELLER, 'image/png', new Uint8Array(5 * 1024 * 1024 + 1))).toMatchObject({
      ok: false,
      code: 'INVALID_ATTACHMENT',
    });
  });

  it('emits role-scoped message, offer, and outbid notifications', async () => {
    const { service } = createService();
    await service.execute(SELLER, registerAuctionCommand());
    await service.execute(BUYER, messageCommand(BUYER, SELLER, 0, '00000000-0000-4000-8000-000000000905', 'Hello'));
    await service.execute(BUYER, createOfferCommand());
    await service.execute(BUYER, placeBidCommand(10, 10_000, 1));
    await service.execute(OTHER_BUYER, placeBidCommand(11, 12_000, 2));

    expect(
      service
        .getNotifications(SELLER)
        .map(({ type }) => type)
        .sort(),
    ).toEqual(['message_received', 'offer_received']);
    expect(service.getNotifications(BUYER).map(({ type }) => type)).toContain('outbid');
    expect(service.getNotifications(OTHER_BUYER)).toEqual([]);
  });

  it('closes a reserve-met auction with one winner and reservation', async () => {
    let now = new Date(NOW);
    const repository = new InMemoryMarketplaceRepository();
    const service = new MarketplaceTransactionService(repository, () => new Date(now));
    await service.execute(SELLER, registerAuctionCommand());
    await service.execute(BUYER, placeBidCommand(20, 10_000, 1));
    await service.execute(OTHER_BUYER, placeBidCommand(21, 8_000, 2));
    now = new Date(NOW.getTime() + 11 * 60 * 1_000);

    const result = await service.execute(SELLER, closeAuctionCommand(3));

    expect(result).toMatchObject({
      ok: true,
      revision: 4,
      result: {
        kind: 'auction_result',
        outcome: 'sold',
        winnerPubky: BUYER,
        listing: { state: 'reserved', auction: { status: 'sold' } },
        reservation: { buyerPubky: BUYER, quantity: 1 },
      },
    });
    expect(service.getNotifications(BUYER).map(({ type }) => type)).toContain('auction_won');
    await expect(service.execute(SELLER, closeAuctionCommand(4, 951))).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_STATE' },
    });
  });

  it('closes an auction without a reserve-met leader as unsold', async () => {
    let now = new Date(NOW);
    const repository = new InMemoryMarketplaceRepository();
    const service = new MarketplaceTransactionService(repository, () => new Date(now));
    await service.execute(SELLER, registerAuctionCommand());
    now = new Date(NOW.getTime() + 11 * 60 * 1_000);

    await expect(service.execute(SELLER, closeAuctionCommand(1))).resolves.toMatchObject({
      ok: true,
      result: {
        kind: 'auction_result',
        outcome: 'unsold',
        winnerPubky: null,
        listing: { state: 'available', auction: { status: 'unsold' } },
        reservation: null,
      },
    });
  });

  it('applies revisioned notification preferences before delivery', async () => {
    const { service } = createService();
    await service.execute(SELLER, registerCommand());
    await service.execute(SELLER, notificationPreferencesCommand(0, false));
    await service.execute(
      BUYER,
      messageCommand(BUYER, SELLER, 0, '00000000-0000-4000-8000-000000000970', 'Muted message'),
    );
    await service.execute(BUYER, createOfferCommand());

    expect(service.getNotificationPreferences(SELLER)).toMatchObject({ revision: 1, messages: false, offers: true });
    expect(service.getNotifications(SELLER).map(({ type }) => type)).toEqual(['offer_received']);
    await expect(service.execute(SELLER, notificationPreferencesCommand(0, true, 961))).resolves.toMatchObject({
      ok: false,
      error: { code: 'REVISION_CONFLICT', currentRevision: 1 },
    });
  });

  it('allows only a notification recipient to mark it read once', async () => {
    const { service } = createService();
    await service.execute(SELLER, registerCommand());
    await service.execute(BUYER, createOfferCommand());
    const notification = service.getNotifications(SELLER)[0];
    const command = {
      version: 1,
      commandId: '00000000-0000-4000-8000-000000000971',
      aggregateId: `notification:${notification.id}`,
      expectedRevision: notification.revision,
      issuedAt: NOW.toISOString(),
      kind: 'notification.mark_read',
      payload: { notificationId: notification.id },
    };

    await expect(service.execute(BUYER, command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
    await expect(service.execute(SELLER, command)).resolves.toMatchObject({
      ok: true,
      result: { kind: 'notification', notification: { revision: 2, readAt: NOW.toISOString() } },
    });
    await expect(
      service.execute(SELLER, {
        ...command,
        commandId: '00000000-0000-4000-8000-000000000972',
        expectedRevision: 2,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_STATE' },
    });
  });

  it('creates an immutable checkout snapshot, reservation, order, and sandbox payment', async () => {
    const { repository, service } = createService();
    await service.execute(SELLER, registerCommand());

    const result = await service.execute(BUYER, checkoutCommand());

    expect(result).toMatchObject({
      ok: true,
      revision: 1,
      result: {
        kind: 'checkout',
        orders: [
          {
            buyerPubky: BUYER,
            sellerPubky: SELLER,
            state: 'pending_payment',
            subtotal: { amountMinor: 12_500 },
            shipping: { amountMinor: 1_200 },
            tax: { amountMinor: 1_096 },
            total: { amountMinor: 14_796 },
            guaranteePolicyVersion: 1,
            lines: [{ listingRevision: 1, contentHash: 'a'.repeat(64), quantity: 1 }],
          },
        ],
        payments: [{ state: 'awaiting_entitlement', adapter: 'sandbox', amount: { amountMinor: 14_796 } }],
      },
    });
    expect(repository.getListing(AGGREGATE_ID)).toMatchObject({
      state: 'reserved',
      availableQuantity: 0,
      reservedQuantity: 1,
      serverRevision: 2,
    });
    expect(service.getOrders(BUYER)).toHaveLength(1);
    expect(service.getOrders(SELLER)).toHaveLength(1);
    expect(service.getOrders(OTHER_BUYER)).toEqual([]);
    expect(service.getNotifications(SELLER).map(({ type }) => type)).toContain('order_created');
  });

  it('advances sandbox payment through detection to confirmation and issues a receipt', async () => {
    const { service } = createService();
    await service.execute(SELLER, registerCommand());
    const checkout = await service.execute(BUYER, checkoutCommand());
    if (!checkout.ok || checkout.result.kind !== 'checkout') return;
    const payment = checkout.result.payments[0];

    await expect(service.execute(BUYER, paymentCommand(payment.id, 1, 'detected', 0, 1_001))).resolves.toMatchObject({
      ok: true,
      result: { kind: 'payment', payment: { state: 'detected', revision: 2 }, receipt: null },
    });
    const confirmed = await service.execute(BUYER, paymentCommand(payment.id, 2, 'confirmed', 1, 1_002));

    expect(confirmed).toMatchObject({
      ok: true,
      result: {
        kind: 'payment',
        payment: { state: 'confirmed', confirmations: 1, revision: 3 },
        order: { state: 'paid', revision: 2, receiptId: expect.any(String) },
        receipt: { contentHash: expect.stringMatching(/^[a-f0-9]{64}$/), total: { amountMinor: 14_796 } },
      },
    });
    if (!confirmed.ok || confirmed.result.kind !== 'payment' || !confirmed.result.receipt) return;
    expect(service.getReceipt(BUYER, confirmed.result.receipt.id)).toEqual(confirmed.result.receipt);
    expect(service.getReceipt(OTHER_BUYER, confirmed.result.receipt.id)).toBeNull();
    expect(service.getNotifications(SELLER).map(({ type }) => type)).toContain('payment_confirmed');
  });

  it('rejects duplicate checkout lines, stale stock, self-purchase, and invalid payment transitions', async () => {
    const { service } = createService();
    await service.execute(SELLER, registerCommand());
    const duplicate = checkoutCommand();
    duplicate.payload.lines.push({ ...duplicate.payload.lines[0] });
    await expect(service.execute(BUYER, duplicate)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_COMMAND' },
    });
    await expect(service.execute(SELLER, checkoutCommand())).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });

    const checkout = await service.execute(BUYER, checkoutCommand());
    if (!checkout.ok || checkout.result.kind !== 'checkout') return;
    const payment = checkout.result.payments[0];
    await expect(service.execute(BUYER, paymentCommand(payment.id, 1, 'confirmed', 0, 1_003))).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_COMMAND' },
    });
    await expect(
      service.execute(OTHER_BUYER, paymentCommand(payment.id, 1, 'detected', 0, 1_004)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });
});
