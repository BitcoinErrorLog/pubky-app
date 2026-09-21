import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BffError } from './bff';
import { resetMarketplaceGrantConfigForTests } from './config';
import { encodeBase64Url, hashCliDeliveryId, sha256Bytes } from './crypto';
import { GrantServiceError } from './service';
import { HomeserverFetchDenied } from './ssrf';

const insertCliChallenge = vi.fn();
const consumeCliRateLimit = vi.fn();
const getCliChallenge = vi.fn();
const consumeChallengeAndInsertCliFlow = vi.fn();
const bindCliFlow = vi.fn();
const terminalizeCliFlow = vi.fn();
const getCliFlow = vi.fn();
const storeCliResultToken = vi.fn();
const acquireCliClaim = vi.fn();
const completeCliClaim = vi.fn();
const abandonCliClaim = vi.fn();
const renewCliClaim = vi.fn();
const assertCliGrantSchema = vi.fn();
const fetchHomeserverProofDocument = vi.fn();
const createBootstrapFlow = vi.fn();
const getGrantStatus = vi.fn();
const ticketGrantResult = vi.fn();
const claimGrantResultWithProof = vi.fn();
const issueNonce = vi.fn();
const cancelGrant = vi.fn();

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    assertCliGrantSchema: (...args: unknown[]) => assertCliGrantSchema(...args),
    insertCliChallenge: (...args: unknown[]) => insertCliChallenge(...args),
    consumeCliRateLimit: (...args: unknown[]) => consumeCliRateLimit(...args),
    getCliChallenge: (...args: unknown[]) => getCliChallenge(...args),
    consumeChallengeAndInsertCliFlow: (...args: unknown[]) => consumeChallengeAndInsertCliFlow(...args),
    bindCliFlow: (...args: unknown[]) => bindCliFlow(...args),
    terminalizeCliFlow: (...args: unknown[]) => terminalizeCliFlow(...args),
    getCliFlow: (...args: unknown[]) => getCliFlow(...args),
    storeCliResultToken: (...args: unknown[]) => storeCliResultToken(...args),
    acquireCliClaim: (...args: unknown[]) => acquireCliClaim(...args),
    completeCliClaim: (...args: unknown[]) => completeCliClaim(...args),
    abandonCliClaim: (...args: unknown[]) => abandonCliClaim(...args),
    renewCliClaim: (...args: unknown[]) => renewCliClaim(...args),
  };
});

vi.mock('./homeserver-proof', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./homeserver-proof')>();
  return {
    ...actual,
    fetchHomeserverProofDocument: (...args: unknown[]) => fetchHomeserverProofDocument(...args),
  };
});

vi.mock('./service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./service')>();
  return {
    ...actual,
    createBootstrapFlow: (...args: unknown[]) => createBootstrapFlow(...args),
    getGrantStatus: (...args: unknown[]) => getGrantStatus(...args),
    ticketGrantResult: (...args: unknown[]) => ticketGrantResult(...args),
    claimGrantResultWithProof: (...args: unknown[]) => claimGrantResultWithProof(...args),
    issueNonce: (...args: unknown[]) => issueNonce(...args),
    cancelGrant: (...args: unknown[]) => cancelGrant(...args),
  };
});

const ENV = { ...process.env };
const pubky = 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy';
const deliveryId = encodeBase64Url(new Uint8Array(32).fill(4));
const nonce = new Uint8Array(32).fill(9);
const challengeId = '018f4f36-7a61-7d4e-8f22-3e31ed45d2af';

function enableCliEnv(): void {
  process.env = {
    ...ENV,
    SHOP_BFF_GRANT_FLOW_ENABLED: 'true',
    SHOP_BFF_CLI_GRANT_ENABLED: 'true',
    SHOP_ALLOWED_ORIGINS: '["https://shop.example"]',
    SHOP_PUBLIC_ORIGIN: 'https://shop.example',
    MARKETPLACE_SERVICE_URL: 'https://service.example',
    SHOP_BFF_GRANT_STATE_DATABASE_URL: 'postgres://example',
    CRON_SECRET: 'c'.repeat(32),
    SHOP_GRANT_ASSERTION_ISSUER: 'https://shop.example',
    SHOP_GRANT_ASSERTION_KEY_ID: 'shop-bff-test-0001',
    SHOP_GRANT_ASSERTION_KEY_EPOCH: '1',
    SHOP_GRANT_ASSERTION_SIGNING_KEY: '11'.repeat(32),
    MARKETPLACE_SERVICE_REQUEST_KEY_ID: 'shop-bff-request-test-0001',
    MARKETPLACE_SERVICE_REQUEST_KEY_EPOCH: '1',
    MARKETPLACE_SERVICE_REQUEST_SIGNING_KEY: '22'.repeat(32),
    SHOP_BFF_GRANT_STATE_ENCRYPTION_KEY_B64: Buffer.alloc(32, 3).toString('base64'),
    SHOP_BFF_GRANT_STATE_KEY_EPOCH: '1',
  };
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://shop.example/api/cli/grant-challenges', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('CLI grant BFF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeCliRateLimit.mockResolvedValue(true);
    assertCliGrantSchema.mockResolvedValue(undefined);
    insertCliChallenge.mockResolvedValue(undefined);
    enableCliEnv();
    resetMarketplaceGrantConfigForTests();
  });

  afterEach(() => {
    process.env = { ...ENV };
    resetMarketplaceGrantConfigForTests();
  });

  it('returns 404 grant_unavailable when the CLI flag is off', async () => {
    process.env.SHOP_BFF_CLI_GRANT_ENABLED = 'false';
    resetMarketplaceGrantConfigForTests();
    const { createCliChallenge } = await import('./cli-bff');
    await expect(
      createCliChallenge(jsonRequest({ pubky, result_cpk: pubky, result_delivery_id: deliveryId })),
    ).rejects.toEqual(new BffError(404, 'grant_unavailable'));
    expect(insertCliChallenge).not.toHaveBeenCalled();
  });

  it('rejects a short pubky before inserting a challenge', async () => {
    const { createCliChallenge } = await import('./cli-bff');
    await expect(
      createCliChallenge(jsonRequest({ pubky: 'y'.repeat(51), result_cpk: pubky, result_delivery_id: deliveryId })),
    ).rejects.toEqual(new BffError(400, 'invalid_request'));
    expect(insertCliChallenge).not.toHaveBeenCalled();
  });

  it('rejects a non-canonical delivery id before inserting a challenge', async () => {
    const { createCliChallenge } = await import('./cli-bff');
    await expect(
      createCliChallenge(
        jsonRequest({
          pubky,
          result_cpk: pubky,
          result_delivery_id: `${deliveryId}=`,
        }),
      ),
    ).rejects.toEqual(new BffError(400, 'invalid_request'));
    expect(insertCliChallenge).not.toHaveBeenCalled();
  });

  it('creates a challenge and returns the raw nonce once', async () => {
    const { createCliChallenge } = await import('./cli-bff');
    const created = await createCliChallenge(jsonRequest({ pubky, result_cpk: pubky, result_delivery_id: deliveryId }));
    expect(created.proof_uri).toBe(
      `pubky://${pubky}/pub/pubky.app/marketplace/v1/cli-grant-proofs/${created.challenge_id}`,
    );
    expect(created.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(insertCliChallenge).toHaveBeenCalledOnce();
  });

  it('does not consume or sign when the homeserver GET is missing', async () => {
    const { getCliGrantConfig } = await import('./config');
    const config = getCliGrantConfig()!;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 60_000);
    getCliChallenge.mockResolvedValue({
      challenge_id: challengeId,
      pubky,
      result_cpk: pubky,
      result_delivery_id_hash: hashCliDeliveryId(config, 1, challengeId, new Uint8Array(32).fill(4)),
      nonce_hash: sha256Bytes(nonce),
      consumed_at: null,
      created_at: createdAt,
      expires_at: expiresAt,
    });
    fetchHomeserverProofDocument.mockRejectedValue(new HomeserverFetchDenied());
    const { verifyCliChallenge } = await import('./cli-bff');
    await expect(verifyCliChallenge(jsonRequest({ nonce: encodeBase64Url(nonce) }), challengeId)).rejects.toEqual(
      new BffError(401, 'homeserver_proof_invalid'),
    );
    expect(consumeChallengeAndInsertCliFlow).not.toHaveBeenCalled();
    expect(createBootstrapFlow).not.toHaveBeenCalled();
  });

  it('leaves the challenge unconsumed when the nonce is wrong', async () => {
    const { getCliGrantConfig } = await import('./config');
    const config = getCliGrantConfig()!;
    getCliChallenge.mockResolvedValue({
      challenge_id: challengeId,
      pubky,
      result_cpk: pubky,
      result_delivery_id_hash: hashCliDeliveryId(config, 1, challengeId, new Uint8Array(32).fill(4)),
      nonce_hash: sha256Bytes(nonce),
      consumed_at: null,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
    });
    const { verifyCliChallenge } = await import('./cli-bff');
    await expect(
      verifyCliChallenge(jsonRequest({ nonce: encodeBase64Url(new Uint8Array(32).fill(1)) }), challengeId),
    ).rejects.toEqual(new BffError(401, 'homeserver_proof_invalid'));
    expect(fetchHomeserverProofDocument).not.toHaveBeenCalled();
    expect(consumeChallengeAndInsertCliFlow).not.toHaveBeenCalled();
  });

  it('creates a bootstrap flow after a matching homeserver proof', async () => {
    const { getCliGrantConfig } = await import('./config');
    const { expectedProofDocument } = await import('./homeserver-proof');
    const config = getCliGrantConfig()!;
    const createdAt = new Date('2026-09-21T10:00:00.000Z');
    const expiresAt = new Date('2026-09-21T10:01:00.000Z');
    const document = expectedProofDocument({
      aud: 'https://shop.example',
      challengeId,
      exp: Math.floor(expiresAt.getTime() / 1000),
      iat: Math.floor(createdAt.getTime() / 1000),
      nonce,
      pubky,
      resultCpk: pubky,
      resultDeliveryId: deliveryId,
    });
    getCliChallenge.mockResolvedValue({
      challenge_id: challengeId,
      pubky,
      result_cpk: pubky,
      result_delivery_id_hash: hashCliDeliveryId(config, 1, challengeId, new Uint8Array(32).fill(4)),
      nonce_hash: sha256Bytes(nonce),
      consumed_at: null,
      created_at: createdAt,
      expires_at: expiresAt,
    });
    fetchHomeserverProofDocument.mockResolvedValue(document);
    consumeChallengeAndInsertCliFlow.mockResolvedValue(undefined);
    createBootstrapFlow.mockResolvedValue({
      authorization_url: 'pubkyauth://signin_grant?x=1',
      expires_at: '2026-09-21T10:05:00.000Z',
      flow_id: randomUUID(),
      status: 'awaiting',
    });
    bindCliFlow.mockResolvedValue(true);
    const { verifyCliChallenge } = await import('./cli-bff');
    const verified = await verifyCliChallenge(jsonRequest({ nonce: encodeBase64Url(nonce) }), challengeId);
    expect(verified.status).toBe('awaiting');
    expect(verified.flow_id).toEqual(expect.any(String));
    expect(verified.cli_token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/,
    );
    expect(createBootstrapFlow).toHaveBeenCalledWith(expect.anything(), deliveryId, pubky, pubky);
  });

  it('maps a second verify to challenge_consumed', async () => {
    getCliChallenge.mockResolvedValue({
      challenge_id: challengeId,
      pubky,
      result_cpk: pubky,
      result_delivery_id_hash: new Uint8Array(32),
      nonce_hash: sha256Bytes(nonce),
      consumed_at: new Date(),
      created_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
    });
    const { verifyCliChallenge } = await import('./cli-bff');
    await expect(verifyCliChallenge(jsonRequest({ nonce: encodeBase64Url(nonce) }), challengeId)).rejects.toEqual(
      new BffError(409, 'challenge_consumed'),
    );
  });

  it('rejects status without a CLI token and never tickets', async () => {
    const { cliFlowStatus } = await import('./cli-bff');
    await expect(cliFlowStatus(jsonRequest({}), randomUUID())).rejects.toEqual(new BffError(401, 'cli_token_denied'));
    expect(getGrantStatus).not.toHaveBeenCalled();
    expect(ticketGrantResult).not.toHaveBeenCalled();
  });

  it('maps CLI service denials without leaking upstream text', async () => {
    const { mapCliBffError } = await import('./cli-bff');
    expect(mapCliBffError(new GrantServiceError(403, 'nope'))).toEqual({
      status: 403,
      code: 'result_denied',
    });
    expect(mapCliBffError(new BffError(429, 'retry_later', 60))).toEqual({
      status: 429,
      code: 'retry_later',
      retryAfterSeconds: 60,
    });
  });
});
