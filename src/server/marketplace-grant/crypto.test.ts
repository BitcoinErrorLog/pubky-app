import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { MarketplaceGrantConfig } from './config';
import {
  cookieMatches,
  decodeBase64Url32,
  encodeBase64Url,
  hashBoundCookie,
  makeBoundCookie,
  openBearer,
  openFlowContext,
  resultPublicKey,
  sealBearer,
  sealFlowContext,
  signDeliveryAssertion,
  signServiceBody,
} from './crypto';

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

describe('marketplace grant BFF cryptography', () => {
  it('binds session cookies to the exact id and secret', () => {
    const id = randomUUID();
    const bound = makeBoundCookie(id);
    const digest = hashBoundCookie(config, 1, 'session', id, bound.secret);
    expect(cookieMatches(digest, hashBoundCookie(config, 1, 'session', id, bound.secret))).toBe(true);
    expect(cookieMatches(digest, hashBoundCookie(config, 1, 'flow', id, bound.secret))).toBe(false);
  });

  it('round-trips and context-binds the sealed bearer', () => {
    const bridgeId = randomUUID();
    const sessionId = randomUUID();
    const pubky = 'y'.repeat(52);
    const bearer = 'A'.repeat(43);
    const sealed = sealBearer(config, bridgeId, sessionId, pubky, bearer);
    expect(openBearer(config, bridgeId, sessionId, pubky, 1, sealed)).toBe(bearer);
    expect(() => openBearer(config, bridgeId, randomUUID(), pubky, 1, sealed)).toThrow();
  });

  it('round-trips the atomic result context and rejects transplant', () => {
    const stateId = randomUUID();
    const bridgeId = randomUUID();
    const context = {
      resultDeliveryId: encodeBase64Url(new Uint8Array(32).fill(4)),
      resultPopSeed: encodeBase64Url(new Uint8Array(32).fill(5)),
      version: 1 as const,
    };
    const sealed = sealFlowContext(config, stateId, bridgeId, context);
    expect(openFlowContext(config, stateId, bridgeId, 1, sealed)).toEqual(context);
    expect(() => openFlowContext(config, stateId, randomUUID(), 1, sealed)).toThrow();
  });

  it('creates canonical service and delivery signatures without exposing seeds', () => {
    const deliveryId = encodeBase64Url(new Uint8Array(32).fill(6));
    const resultCpk = resultPublicKey(new Uint8Array(32).fill(7));
    expect(resultCpk).toMatch(/^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/);
    const assertion = signDeliveryAssertion(config, deliveryId, resultCpk, 'y'.repeat(52), 1_760_000_000, randomUUID());
    expect(assertion.split('.')).toHaveLength(3);
    const signed = signServiceBody(config, { method: 'POST', path: '/v1/example', request_id: randomUUID() });
    expect(signed.signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(new TextDecoder().decode(signed.bytes)).toContain('"method":"POST"');
    expect(decodeBase64Url32(deliveryId)).toHaveLength(32);
  });
});
