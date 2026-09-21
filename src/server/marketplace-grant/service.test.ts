/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketplaceGrantConfig } from './config';
import { claimGrantResult, getGrantStatus, GrantServiceError, verifyMarketplaceSession } from './service';

const config: MarketplaceGrantConfig = {
  allowedOrigins: ['https://shop.example'],
  publicOrigin: 'https://shop.example',
  serviceUrl: 'https://service.example',
  databaseUrl: 'postgres://example',
  cronSecret: 'c'.repeat(32),
  assertionIssuer: 'https://shop.example',
  assertionKeyId: 'shop-bff-test-0001',
  assertionKeyEpoch: 1,
  assertionSigningKey: '11'.repeat(32),
  requestKeyId: 'shop-bff-test-request-0001',
  requestKeyEpoch: 1,
  requestSigningKey: '22'.repeat(32),
  stateKey: Buffer.alloc(32, 3).toString('base64'),
  stateKeyEpoch: 1,
  stateTtlSeconds: 300,
  claimLeaseSeconds: 25,
  databaseTimeoutMs: 2000,
  serviceTimeoutMs: 5000,
};

const pubky = 'y'.repeat(52);
const bearer = 'A'.repeat(43);
const sessionId = '018f4f36-7a61-7d4e-8f22-3e31ed45d2af';

describe('marketplace service session pairing', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts only a seller-bound bearer with the exact live session id', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          schema_version: 1,
          sessions: [
            {
              id: sessionId,
              expires_at: '2099-01-01T00:00:00Z',
              revoked_at: null,
            },
          ],
        }),
      );
    await expect(verifyMarketplaceSession(config, bearer, pubky, sessionId)).resolves.toEqual(
      new Date('2099-01-01T00:00:00Z'),
    );
    expect(fetchMock.mock.calls[0][0]).toBe(`https://service.example/v1/sellers/${pubky}/listings?limit=1`);
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ authorization: `Bearer ${bearer}` });
  });

  it('rejects a bearer whose service actor does not match the claimed Shop pubky', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 403 }));
    await expect(verifyMarketplaceSession(config, bearer, pubky, sessionId)).rejects.toEqual(
      new GrantServiceError(403, 'invalid_session_pair'),
    );
  });

  it('rejects a revoked service session even when the seller probe passes', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        Response.json({
          schema_version: 1,
          sessions: [
            {
              id: sessionId,
              expires_at: '2099-01-01T00:00:00Z',
              revoked_at: '2026-09-20T16:00:00Z',
            },
          ],
        }),
      );
    await expect(verifyMarketplaceSession(config, bearer, pubky, sessionId)).rejects.toEqual(
      new GrantServiceError(401, 'invalid_session_pair'),
    );
  });
});

describe('marketplace grant status', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses a live awaiting GET body', async () => {
    const flowId = '018f4f36-7a61-7d4e-8f22-3e31ed45d2af';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        expires_at: '2026-09-21T10:05:00.000Z',
        flow_id: flowId,
        status: 'awaiting',
      }),
    );
    await expect(getGrantStatus(config, flowId)).resolves.toEqual({
      expires_at: '2026-09-21T10:05:00.000Z',
      flow_id: flowId,
      status: 'awaiting',
    });
  });

  it('maps a redacted 410 terminal body to invalid without throwing ZodError', async () => {
    const flowId = '018f4f36-7a61-7d4e-8f22-3e31ed45d2af';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'terminal' }), {
        status: 410,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const status = await getGrantStatus(config, flowId);
    expect(status.status).toBe('invalid');
    expect(status.flow_id).toBe(flowId);
    expect(status.terminal_code).toBeNull();
  });

  it('maps a live-shaped 410 body to invalid and does not parse it as awaiting', async () => {
    const flowId = '018f4f36-7a61-7d4e-8f22-3e31ed45d2af';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          expires_at: '2026-09-21T10:05:00.000Z',
          flow_id: flowId,
          status: 'awaiting',
        }),
        {
          status: 410,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const status = await getGrantStatus(config, flowId);
    expect(status.status).toBe('invalid');
    expect(status.flow_id).toBe(flowId);
    expect(status.terminal_code).toBeNull();
  });
});

describe('marketplace grant claim heartbeats', () => {
  afterEach(() => vi.restoreAllMocks());

  it('heartbeats after each slowed service call and still claims', async () => {
    const flowId = '018f4f36-7a61-7d4e-8f22-3e31ed45d2af';
    const order: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      order.push(`fetch:${url.slice(url.lastIndexOf('/') + 1)}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (url.endsWith('/result-nonces')) {
        return Response.json({
          expires_at: '2099-01-01T00:00:00Z',
          nonce: 'nonce',
          nonce_id: sessionId,
        });
      }
      if (url.endsWith('/result-ticket')) {
        return Response.json({ expires_at: '2099-01-01T00:00:00Z', result_token: 'ticket' });
      }
      if (url.endsWith('/claim')) {
        return Response.json({
          capabilities: '',
          expires_at: '2099-01-01T00:00:00Z',
          pubky,
          token: bearer,
        });
      }
      return new Response('{}', { status: 500 });
    });
    const heartbeat = vi.fn(async () => {
      order.push('heartbeat');
    });
    await expect(
      claimGrantResult(
        config,
        flowId,
        'd'.repeat(43),
        Uint8Array.from({ length: 32 }, () => 7),
        heartbeat,
      ),
    ).resolves.toMatchObject({ pubky, token: bearer });
    expect(heartbeat).toHaveBeenCalledTimes(4);
    expect(order).toEqual([
      'fetch:result-nonces',
      'heartbeat',
      'fetch:result-ticket',
      'heartbeat',
      'fetch:result-nonces',
      'heartbeat',
      'fetch:claim',
      'heartbeat',
    ]);
  });
});
