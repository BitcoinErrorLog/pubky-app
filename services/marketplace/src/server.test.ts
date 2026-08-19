import type { AddressInfo } from 'node:net';
import { fetch as realFetch } from 'undici';
import { describe, expect, it } from 'vitest';
import { buildMarketplaceListingAggregateId } from './contracts';
import { createMarketplaceHttpServer, type MarketplaceServerMode } from './server';

const SELLER = 'y'.repeat(52);

async function withServer<T>(mode: MarketplaceServerMode, operation: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createMarketplaceHttpServer({ mode });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;

  try {
    return await operation(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function registrationCommand() {
  return {
    version: 1,
    commandId: '018f47d2-6a27-7c23-a49d-6b21bb770120',
    aggregateId: buildMarketplaceListingAggregateId(SELLER, 'boots_01'),
    expectedRevision: 0,
    issuedAt: '2026-08-19T22:00:00.000Z',
    kind: 'listing.register',
    payload: {
      sellerPubky: SELLER,
      listingId: 'boots_01',
      listingRevision: 1,
      contentHash: 'a'.repeat(64),
      quantity: 1,
      unitPrice: { amountMinor: 12_500, currency: 'USD', exponent: 2 },
    },
  };
}

describe('marketplace HTTP server', () => {
  it('reports liveness while disabled but fails readiness closed', async () => {
    await withServer('disabled', async (baseUrl) => {
      const live = await realFetch(`${baseUrl}/health/live`);
      const ready = await realFetch(`${baseUrl}/health/ready`);

      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ status: 'live' });
      expect(ready.status).toBe(503);
      expect(await ready.json()).toEqual({ status: 'not_ready', mode: 'disabled', storage: 'memory' });
    });
  });

  it('rejects commands when sandbox mode was not explicit', async () => {
    await withServer('disabled', async (baseUrl) => {
      const response = await realFetch(`${baseUrl}/v1/commands`, {
        method: 'POST',
        body: JSON.stringify(registrationCommand()),
      });

      expect(response.status).toBe(503);
      expect(response.headers.get('x-marketplace-mode')).toBe('disabled');
    });
  });

  it('requires an explicit sandbox actor and labels every response', async () => {
    await withServer('sandbox', async (baseUrl) => {
      const missingActor = await realFetch(`${baseUrl}/v1/commands`, {
        method: 'POST',
        body: JSON.stringify(registrationCommand()),
      });
      expect(missingActor.status).toBe(401);

      const accepted = await realFetch(`${baseUrl}/v1/commands`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-pubky-actor': SELLER,
        },
        body: JSON.stringify(registrationCommand()),
      });

      expect(accepted.status).toBe(200);
      expect(accepted.headers.get('x-marketplace-mode')).toBe('sandbox');
      await expect(accepted.json()).resolves.toMatchObject({ ok: true, revision: 1 });
    });
  });

  it('returns a coarse error for malformed JSON without echoing the body', async () => {
    await withServer('sandbox', async (baseUrl) => {
      const response = await realFetch(`${baseUrl}/v1/commands`, {
        method: 'POST',
        headers: {
          'x-pubky-actor': SELLER,
        },
        body: '{"private":"secret"',
      });

      expect(response.status).toBe(400);
      const body = await response.text();
      expect(body).toContain('INVALID_JSON');
      expect(body).not.toContain('secret');
    });
  });
});
