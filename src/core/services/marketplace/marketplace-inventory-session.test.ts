import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INVENTORY_GRANT, INVENTORY_SESSION_STORAGE_KEY } from './marketplace-inventory-grant';
import { MarketplaceInventorySessionService } from './marketplace-inventory-session';
import { MARKETPLACE_SESSION_STORAGE_KEY, MarketplaceSessionService } from './marketplace-session';

const PUBKY = 'y'.repeat(52);
const TOKEN = 'A'.repeat(43);
const INVENTORY_TOKEN = 'I'.repeat(43);

const config = vi.hoisted(() => ({
  mode: 'transaction-service' as string,
}));

const authTokenFlow = vi.hoisted(() => ({
  awaitToken: vi.fn(),
  cancelAuthFlow: vi.fn(),
  capabilities: '' as string | undefined,
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
  HomeserverService: {
    generateAuthTokenFlow: (capabilities = '') => {
      authTokenFlow.capabilities = capabilities;
      return {
        authorizationUrl: 'pubkyauth:///?relay=http%3A%2F%2Flocalhost%2Finbox&secret=s',
        awaitToken: authTokenFlow.awaitToken,
        cancelAuthFlow: authTokenFlow.cancelAuthFlow,
      };
    },
  },
}));

function sessionResponse(expiresAt: string, token: string, capabilities: string): Response {
  return new Response(
    JSON.stringify({
      token,
      pubky: PUBKY,
      capabilities,
      expires_at: expiresAt,
      session_id: '11111111-1111-4111-8111-111111111111',
    }),
    { status: 201, headers: { 'content-type': 'application/json' } },
  );
}

function inOneDay(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}

async function establishIdentity(): Promise<void> {
  vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay(), TOKEN, ''));
  await MarketplaceSessionService.establishWithAuthToken(new Uint8Array([1, 2, 3]), PUBKY);
}

describe('MarketplaceInventorySessionService', () => {
  beforeEach(() => {
    config.mode = 'transaction-service';
    authTokenFlow.capabilities = undefined;
    MarketplaceInventorySessionService.clearSession();
    MarketplaceSessionService.clearSession();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mints with the inventory grant only and never overwrites the identity bearer', async () => {
    await establishIdentity();
    const identityBefore = window.localStorage.getItem(MARKETPLACE_SESSION_STORAGE_KEY);
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay(), INVENTORY_TOKEN, INVENTORY_GRANT));

    const bytes = new Uint8Array([9, 8, 7]);
    const info = await MarketplaceInventorySessionService.mintInventorySession(bytes, PUBKY);

    expect(info.capabilities).toBe(INVENTORY_GRANT);
    expect(fetch).toHaveBeenLastCalledWith(
      'http://127.0.0.1:8080/v1/auth/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: bytes,
      }),
    );
    expect(MarketplaceSessionService.getActiveSession()?.token).toBe(TOKEN);
    expect(window.localStorage.getItem(MARKETPLACE_SESSION_STORAGE_KEY)).toBe(identityBefore);
    expect(MarketplaceInventorySessionService.getActiveSession()?.token).toBe(INVENTORY_TOKEN);
    expect(window.localStorage.getItem(INVENTORY_SESSION_STORAGE_KEY)).toContain(INVENTORY_TOKEN);
    expect(JSON.parse(window.localStorage.getItem(INVENTORY_SESSION_STORAGE_KEY) ?? '{}').capabilities).toBe(
      INVENTORY_GRANT,
    );
  });

  it('passes INVENTORY_GRANT into generateAuthTokenFlow', async () => {
    await establishIdentity();
    MarketplaceInventorySessionService.beginInventorySessionFlow(PUBKY);
    expect(authTokenFlow.capabilities).toBe(INVENTORY_GRANT);
    expect(authTokenFlow.capabilities).not.toBe('/:rw');
    expect(authTokenFlow.capabilities).not.toBe('');
  });

  it('refuses to mint when the identity session is missing', async () => {
    await expect(
      MarketplaceInventorySessionService.mintInventorySession(new Uint8Array([1]), PUBKY),
    ).rejects.toMatchObject({
      operation: 'mintInventorySession',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not clear inventory when the identity session is dropped', async () => {
    await establishIdentity();
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay(), INVENTORY_TOKEN, INVENTORY_GRANT));
    await MarketplaceInventorySessionService.mintInventorySession(new Uint8Array([1]), PUBKY);

    MarketplaceSessionService.clearSession('rejected');
    expect(MarketplaceInventorySessionService.getActiveSession()?.token).toBe(INVENTORY_TOKEN);
  });

  it('clears only the inventory slot', async () => {
    await establishIdentity();
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay(), INVENTORY_TOKEN, INVENTORY_GRANT));
    await MarketplaceInventorySessionService.mintInventorySession(new Uint8Array([1]), PUBKY);

    MarketplaceInventorySessionService.clearSession('rejected');
    expect(MarketplaceInventorySessionService.getActiveSession()).toBeNull();
    expect(MarketplaceSessionService.getActiveSession()?.token).toBe(TOKEN);
  });

  it('clamps padded returned caps to the requested grant and refuses wider blobs', async () => {
    await establishIdentity();
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay(), INVENTORY_TOKEN, ` ${INVENTORY_GRANT} `));
    const padded = await MarketplaceInventorySessionService.mintInventorySession(new Uint8Array([1]), PUBKY);
    expect(padded.capabilities).toBe(INVENTORY_GRANT);
    expect(JSON.parse(window.localStorage.getItem(INVENTORY_SESSION_STORAGE_KEY) ?? '{}').capabilities).toBe(
      INVENTORY_GRANT,
    );

    MarketplaceInventorySessionService.clearSession();
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay(), INVENTORY_TOKEN, '/:rw'));
    await expect(
      MarketplaceInventorySessionService.mintInventorySession(new Uint8Array([1]), PUBKY),
    ).rejects.toMatchObject({ operation: 'mintInventorySession' });
    expect(MarketplaceInventorySessionService.getActiveSession()).toBeNull();
    expect(window.localStorage.getItem(INVENTORY_SESSION_STORAGE_KEY)).toBeNull();

    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay(), INVENTORY_TOKEN, `${INVENTORY_GRANT},/:rw`));
    await expect(
      MarketplaceInventorySessionService.mintInventorySession(new Uint8Array([1]), PUBKY),
    ).rejects.toMatchObject({ operation: 'mintInventorySession' });
    expect(window.localStorage.getItem(INVENTORY_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('drops a restored session whose stored caps are wider than the Studio grant', () => {
    window.localStorage.setItem(
      INVENTORY_SESSION_STORAGE_KEY,
      JSON.stringify({
        token: INVENTORY_TOKEN,
        pubky: PUBKY,
        capabilities: '/:rw',
        expiresAt: inOneDay(),
      }),
    );
    expect(MarketplaceInventorySessionService.restorePersistedSession(PUBKY)).toBeNull();
    expect(window.localStorage.getItem(INVENTORY_SESSION_STORAGE_KEY)).toBeNull();
  });
});
