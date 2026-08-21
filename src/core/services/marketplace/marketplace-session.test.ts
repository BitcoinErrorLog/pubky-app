import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MARKETPLACE_SESSION_STORAGE_KEY,
  MarketplaceSessionService,
  SESSION_FLOW_TIMEOUT_MS,
} from './marketplace-session';

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

/** Simulates a page reload: the in-memory session dies, localStorage survives. */
function dropMemoryOnly() {
  const persisted = window.localStorage.getItem(MARKETPLACE_SESSION_STORAGE_KEY);
  MarketplaceSessionService.clearSession();
  if (persisted !== null) {
    window.localStorage.setItem(MARKETPLACE_SESSION_STORAGE_KEY, persisted);
  }
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

  it('persists the session to localStorage only — never sessionStorage or IndexedDB', async () => {
    const sessionSetItemSpy = vi.spyOn(window.sessionStorage, 'setItem');
    const indexedDbOpenSpy = vi.spyOn(indexedDB, 'open');
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay()));

    await MarketplaceSessionService.establishWithAuthToken(new Uint8Array([1]));

    const persisted = window.localStorage.getItem(MARKETPLACE_SESSION_STORAGE_KEY);
    expect(persisted).not.toBeNull();
    expect(JSON.parse(persisted!)).toMatchObject({ token: TOKEN, pubky: PUBKY });
    expect(sessionSetItemSpy).not.toHaveBeenCalled();
    expect(indexedDbOpenSpy).not.toHaveBeenCalled();
    sessionSetItemSpy.mockRestore();
    indexedDbOpenSpy.mockRestore();
  });

  it('restores a persisted session for the matching account across a simulated reload', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay()));
    await MarketplaceSessionService.establishWithAuthToken(new Uint8Array([1]));

    dropMemoryOnly();
    expect(MarketplaceSessionService.getActiveSession()).toBeNull();

    const info = MarketplaceSessionService.restorePersistedSession(PUBKY);

    expect(info).toMatchObject({ pubky: PUBKY });
    expect(info).not.toHaveProperty('token');
    expect(MarketplaceSessionService.getActiveSession()).toMatchObject({ token: TOKEN, pubky: PUBKY });
  });

  it('drops a persisted session that belongs to another account', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay()));
    await MarketplaceSessionService.establishWithAuthToken(new Uint8Array([1]));
    dropMemoryOnly();

    expect(MarketplaceSessionService.restorePersistedSession('z'.repeat(52))).toBeNull();
    expect(window.localStorage.getItem(MARKETPLACE_SESSION_STORAGE_KEY)).toBeNull();
    expect(MarketplaceSessionService.getActiveSession()).toBeNull();
  });

  it('drops a persisted session that is past the expiry margin or malformed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse('2026-08-20T13:00:00.000Z'));
    await MarketplaceSessionService.establishWithAuthToken(new Uint8Array([1]));
    dropMemoryOnly();

    vi.setSystemTime(new Date('2026-08-20T12:59:31.000Z'));
    expect(MarketplaceSessionService.restorePersistedSession(PUBKY)).toBeNull();
    expect(window.localStorage.getItem(MARKETPLACE_SESSION_STORAGE_KEY)).toBeNull();

    window.localStorage.setItem(MARKETPLACE_SESSION_STORAGE_KEY, 'not json');
    expect(MarketplaceSessionService.restorePersistedSession(PUBKY)).toBeNull();
    expect(window.localStorage.getItem(MARKETPLACE_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('refuses to restore outside durable modes even when a blob is persisted', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay()));
    await MarketplaceSessionService.establishWithAuthToken(new Uint8Array([1]));
    dropMemoryOnly();
    config.mode = 'sandbox';

    expect(MarketplaceSessionService.restorePersistedSession(PUBKY)).toBeNull();
    expect(MarketplaceSessionService.getActiveSession()).toBeNull();
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

  it('clears the session from memory AND localStorage on demand', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay()));
    await MarketplaceSessionService.establishWithAuthToken(new Uint8Array([1]));
    expect(window.localStorage.getItem(MARKETPLACE_SESSION_STORAGE_KEY)).not.toBeNull();

    MarketplaceSessionService.clearSession();

    expect(MarketplaceSessionService.getActiveSession()).toBeNull();
    expect(window.localStorage.getItem(MARKETPLACE_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('times out an unapproved flow with a retryable error and frees the underlying auth flow', async () => {
    vi.useFakeTimers();
    authTokenFlow.awaitToken.mockReturnValueOnce(new Promise(() => {})); // never approved

    const flow = MarketplaceSessionService.beginSessionFlow();
    const pending = flow.awaitSession();
    const outcome = expect(pending).rejects.toMatchObject({
      name: 'AppError',
      code: 'REQUEST_TIMEOUT',
      message: expect.stringContaining('expired before it was approved'),
    });

    await vi.advanceTimersByTimeAsync(SESSION_FLOW_TIMEOUT_MS);
    await outcome;
    expect(authTokenFlow.cancelAuthFlow).toHaveBeenCalled();
    expect(MarketplaceSessionService.getActiveSession()).toBeNull();
  });

  it('does not fire the timeout once the exchange already succeeded', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(sessionResponse(inOneDay()));
    authTokenFlow.awaitToken.mockResolvedValueOnce({ toBytes: () => new Uint8Array([7]) });

    const flow = MarketplaceSessionService.beginSessionFlow();
    const info = await flow.awaitSession();
    await vi.advanceTimersByTimeAsync(SESSION_FLOW_TIMEOUT_MS + 1_000);

    expect(info).toMatchObject({ pubky: PUBKY });
    expect(MarketplaceSessionService.getActiveSession()).toMatchObject({ token: TOKEN });
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
