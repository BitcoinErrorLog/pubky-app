import { describe, expect, it } from 'vitest';
import { buildMarketplaceListingAggregateId } from './contracts';
import { InMemoryMarketplaceRepository, MarketplaceTransactionService } from './transaction-service';

const SELLER = 'y'.repeat(52);
const BUYER = 'b'.repeat(52);
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
});
