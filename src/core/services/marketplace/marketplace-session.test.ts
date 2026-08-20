import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceSessionService } from './marketplace-session';

const PUBKY = 'y'.repeat(52);
const TOKEN = 'opaque-session-token-base64url';

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

const authTokenFlow = vi.hoisted(() => ({
  awaitToken: vi.fn(),
  cancelAuthFlow: vi.fn(),
}));

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    generateAuthTokenFlow: () => ({
      authorizationUrl: 'pubkyauth:///?relay=http%3A%2F%2Flocalhost%2Finbox&secret=s',
      awaitToken: authTokenFlow.awaitToken,
      cancelAuthFlow: authTokenFlow.cancelAuthFlow,
    }),
  },
}));

function sessionResponse(expiresAt: string, token = TOKEN): Response {
  return new Response(JSON.stringify({ token, pubky: PUBKY, capabilities: '', expires_at: expiresAt }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
}

function inOneDay(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}

describe('MarketplaceSessionService', () => {
  beforeEach(() => {
    config.mode = 'transaction-service';
    MarketplaceSessionService.clearSession();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('POSTs raw AuthToken bytes and stores the issued session in memory', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay()));

    const info = await MarketplaceSessionService.establishWithAuthToken(bytes);

    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/v1/auth/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: bytes,
      }),
    );
    expect(info).toEqual({ pubky: PUBKY, capabilities: '', expiresAt: expect.any(String) });
    expect(MarketplaceSessionService.getActiveSession()).toMatchObject({ token: TOKEN, pubky: PUBKY });
  });

  it('never hands the bearer token to callers of the session flow', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay()));
    authTokenFlow.awaitToken.mockResolvedValueOnce({ toBytes: () => new Uint8Array([9, 9, 9]) });

    const flow = MarketplaceSessionService.beginSessionFlow();
    const info = await flow.awaitSession();

    expect(info).not.toHaveProperty('token');
    expect(JSON.stringify(info)).not.toContain(TOKEN);
  });

  it('never writes the session token to localStorage, sessionStorage, or IndexedDB', async () => {
    const storageWrites: string[] = [];
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation((key: string, value: string) => storageWrites.push(`${key}=${value}`));
    const indexedDbOpenSpy = vi.spyOn(indexedDB, 'open');
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay()));

    await MarketplaceSessionService.establishWithAuthToken(new Uint8Array([1]));

    expect(storageWrites.join('\n')).not.toContain(TOKEN);
    expect(indexedDbOpenSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
    indexedDbOpenSpy.mockRestore();
  });

  it('treats a session as absent once it reaches the expiry margin, and re-establishes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse('2026-08-20T13:00:00.000Z', 'first-token'));
    await MarketplaceSessionService.establishWithAuthToken(new Uint8Array([1]));
    expect(MarketplaceSessionService.getActiveSession()).toMatchObject({ token: 'first-token' });

    // 30s before the server-side expiry the client already refuses to use it.
    vi.setSystemTime(new Date('2026-08-20T12:59:31.000Z'));
    expect(MarketplaceSessionService.getActiveSession()).toBeNull();

    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse('2026-08-20T14:00:00.000Z', 'second-token'));
    await MarketplaceSessionService.establishWithAuthToken(new Uint8Array([2]));
    expect(MarketplaceSessionService.getActiveSession()).toMatchObject({ token: 'second-token' });
  });

  it('clears the session on demand', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay()));
    await MarketplaceSessionService.establishWithAuthToken(new Uint8Array([1]));

    MarketplaceSessionService.clearSession();

    expect(MarketplaceSessionService.getActiveSession()).toBeNull();
  });

  it('rejects establishment when the service refuses the auth token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'The auth token is invalid.' } }), { status: 401 }),
    );

    await expect(MarketplaceSessionService.establishWithAuthToken(new Uint8Array([1]))).rejects.toMatchObject({
      name: 'AppError',
      code: 'INVALID_TOKEN',
    });
    expect(MarketplaceSessionService.getActiveSession()).toBeNull();
  });

  it('fails closed outside transaction-service mode', async () => {
    config.mode = 'sandbox';

    expect(() => MarketplaceSessionService.beginSessionFlow()).toThrowError();
    await expect(MarketplaceSessionService.establishWithAuthToken(new Uint8Array([1]))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
