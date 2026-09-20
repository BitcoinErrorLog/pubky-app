import type { Keypair, PublicKey, Session } from '@synonymdev/pubky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPABILITIES } from '@/config/app';
import { AppError } from '@/libs/error/error';
import {
  AuthErrorCode,
  ClientErrorCode,
  NetworkErrorCode,
  ServerErrorCode,
  ValidationErrorCode,
} from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { isRetryable } from '@/libs/error/error.utils';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { HOMESERVER_EVENT_STREAM_SUBSCRIBE_OPERATION } from '@/libs/observability/sentry.constants';
import { shouldDropAppErrorFromSentry } from '@/libs/observability/sentry.utils';
import { asOpaque } from '@/test-utils/type-assertions';
import { bytesToBase64 } from './homeserver.utils';

// =============================================================================
// HOISTED MOCKS - Must be hoisted to run before module imports
// =============================================================================

const mockState = vi.hoisted(() => ({
  // Signer methods
  signupCookie: vi.fn(),
  signinCookie: vi.fn(),
  publishHomeserverForce: vi.fn(),
  // Session methods
  sessionSignout: vi.fn(),
  // Session storage
  sessionStorageGet: vi.fn(),
  sessionStorageExists: vi.fn(),
  sessionStoragePutJson: vi.fn(),
  sessionStoragePutBytes: vi.fn(),
  sessionStorageDelete: vi.fn(),
  sessionStorageList: vi.fn(),
  // Client methods
  clientFetch: vi.fn(),
  // Public storage
  publicStorageGet: vi.fn(),
  publicStorageExists: vi.fn(),
  publicStorageList: vi.fn(),
  // Pubky methods
  getHomeserverOf: vi.fn(),
  restoreSession: vi.fn(),
  startAuthFlow: vi.fn(),
  startCookieAuthFlow: vi.fn(),
  authFlowKindSignin: vi.fn(),
  authTokenFromBytes: vi.fn(),
  eventStreamForUser: vi.fn(),
  // Auth store session
  currentSession: null as Session | null,
}));

// Mock global fetch for generateSignupToken tests (calls /api/dev/signup-token)
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock pubky-app-specs to avoid WebAssembly issues
vi.mock('pubky-app-specs', () => ({
  default: vi.fn(() => Promise.resolve()),
  getValidMimeTypes: () => ['image/jpeg', 'image/png'],
}));

// Mock Logger to suppress console output during tests
vi.mock('@/libs/logger/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock useAuthStore to provide session
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: () => ({
      selectSession: () => {
        // Access mockState.currentSession at call time, not at mock creation time
        return mockState.currentSession;
      },
    }),
  },
}));

// =============================================================================
// MOCK @synonymdev/pubky MODULE
// =============================================================================

vi.mock('@synonymdev/pubky', () => {
  const createMockPubkyInstance = () => ({
    getHomeserverOf: (...args: unknown[]) => mockState.getHomeserverOf(...args),
    restoreSession: (...args: unknown[]) => mockState.restoreSession(...args),
    startAuthFlow: (...args: unknown[]) => mockState.startAuthFlow(...args),
    startCookieAuthFlow: (...args: unknown[]) => mockState.startCookieAuthFlow(...args),
    eventStreamForUser: (...args: unknown[]) => mockState.eventStreamForUser(...args),
    client: {
      fetch: (...args: unknown[]) => mockState.clientFetch(...args),
    },
    publicStorage: {
      get: (...args: unknown[]) => mockState.publicStorageGet(...args),
      exists: (...args: unknown[]) => mockState.publicStorageExists(...args),
      list: (...args: unknown[]) => mockState.publicStorageList(...args),
    },
    signer: () => ({
      signupCookie: (...args: unknown[]) => mockState.signupCookie(...args),
      signinCookie: (...args: unknown[]) => mockState.signinCookie(...args),
      pkdns: {
        publishHomeserverForce: (...args: unknown[]) => mockState.publishHomeserverForce(...args),
      },
    }),
  });

  const MockPubky = vi.fn().mockImplementation(createMockPubkyInstance);
  // @ts-expect-error - Adding static testnet method
  MockPubky.testnet = vi.fn().mockImplementation(createMockPubkyInstance);

  return {
    Pubky: MockPubky,
    PublicKey: {
      from: vi.fn().mockReturnValue({
        z32: () => 'homeserver-public-key-z32',
      }),
    },
    Keypair: {
      random: vi.fn(),
      fromSecret: vi.fn(),
    },
    AuthFlowKind: {
      signin: () => mockState.authFlowKindSignin(),
    },
    AuthFlow: {
      start: (...args: unknown[]) => mockState.startAuthFlow(...args),
    },
    AuthToken: {
      fromBytes: (...args: unknown[]) => mockState.authTokenFromBytes(...args),
    },
    resolvePubky: vi.fn((url: string) => url.replace('pubky://', 'https://')),
  };
});

// =============================================================================
// HELPER FACTORIES
// =============================================================================

/**
 * Creates a mock Session object
 */
const createMockSession = (): Session =>
  asOpaque<Session>({
    info: {
      publicKey: {
        z32: () => 'user',
      },
    },
    storage: {
      get: (...args: unknown[]) => mockState.sessionStorageGet(...args),
      exists: (...args: unknown[]) => mockState.sessionStorageExists(...args),
      putJson: (...args: unknown[]) => mockState.sessionStoragePutJson(...args),
      putBytes: (...args: unknown[]) => mockState.sessionStoragePutBytes(...args),
      delete: (...args: unknown[]) => mockState.sessionStorageDelete(...args),
      list: (...args: unknown[]) => mockState.sessionStorageList(...args),
    },
    signout: (...args: unknown[]) => mockState.sessionSignout(...args),
  });

/**
 * Creates a mock Keypair
 */
const createMockKeypair = (): Keypair =>
  asOpaque<Keypair>({
    publicKey: {
      z32: () => 'test-public-key-z32',
    } as PublicKey,
    secret: vi.fn(() => new Uint8Array(32).fill(1)),
  });

/**
 * Temporarily declare a staging deploy (PUBKY_RUNTIME_ENV=staging) and point
 * runtime config at canonical staging homeserver values.
 */
async function withStagingHomeserverEnv(
  run: () => Promise<void>,
  { keepTestHomeserver = false }: { keepTestHomeserver?: boolean } = {},
): Promise<void> {
  const { resetRuntimeConfigForTests } = await import('@/libs/runtime-config/runtime-config');
  const { NETWORK_RUNTIME_DEFAULTS } = await import('@/libs/runtime-config/runtime-config.schema');

  const previousDeployEnv = process.env.PUBKY_RUNTIME_ENV;
  const previousHomeserver = process.env.PUBKY_RUNTIME_HOMESERVER;
  const previousHomeserverUrl = process.env.PUBKY_RUNTIME_HOMESERVER_URL;
  process.env.PUBKY_RUNTIME_ENV = 'staging';
  if (!keepTestHomeserver) {
    process.env.PUBKY_RUNTIME_HOMESERVER = NETWORK_RUNTIME_DEFAULTS.homeserver;
    process.env.PUBKY_RUNTIME_HOMESERVER_URL = NETWORK_RUNTIME_DEFAULTS.homeserverUrl;
  }
  resetRuntimeConfigForTests();

  try {
    await run();
  } finally {
    process.env.PUBKY_RUNTIME_ENV = previousDeployEnv;
    process.env.PUBKY_RUNTIME_HOMESERVER = previousHomeserver;
    process.env.PUBKY_RUNTIME_HOMESERVER_URL = previousHomeserverUrl;
    resetRuntimeConfigForTests();
  }
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('HomeserverService', () => {
  let HomeserverService: typeof import('@/services/homeserver/homeserver').HomeserverService;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockState.currentSession = null;

    // Setup default successful behaviors
    mockState.signupCookie.mockResolvedValue(createMockSession());
    mockState.signinCookie.mockResolvedValue(createMockSession());
    mockState.restoreSession.mockResolvedValue(createMockSession());
    mockState.publishHomeserverForce.mockResolvedValue(undefined);
    mockState.clientFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    mockState.publicStorageGet.mockResolvedValue(new Response('{}', { status: 200 }));
    mockState.publicStorageExists.mockResolvedValue(true);
    mockState.publicStorageList.mockResolvedValue([]);
    mockState.getHomeserverOf.mockResolvedValue('https://test-homeserver.com');
    mockState.sessionSignout.mockResolvedValue(undefined);
    mockState.sessionStorageGet.mockResolvedValue(new Response('{}', { status: 200 }));
    mockState.sessionStorageExists.mockResolvedValue(true);
    mockState.sessionStoragePutJson.mockResolvedValue(undefined);
    mockState.sessionStoragePutBytes.mockResolvedValue(undefined);
    mockState.sessionStorageDelete.mockResolvedValue(undefined);
    mockState.sessionStorageList.mockResolvedValue([]);
    mockState.startCookieAuthFlow.mockReturnValue({
      authorizationUrl: 'https://auth.example.com/authorize',
      tryPollOnce: vi.fn().mockResolvedValue(createMockSession()),
      free: vi.fn(),
    });
    mockState.authTokenFromBytes.mockReset();
    mockState.authFlowKindSignin.mockReturnValue('signin-kind');
    mockState.eventStreamForUser.mockReturnValue({
      path: vi.fn().mockReturnThis(),
      live: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockResolvedValue(new ReadableStream()),
    });

    // Reset module cache and re-import
    vi.resetModules();
    ({ HomeserverService } = await import('@/services/homeserver/homeserver'));
  });

  // ===========================================================================
  // API SURFACE
  // ===========================================================================

  describe('API Surface', () => {
    it('should expose the expected public API', () => {
      expect(HomeserverService).toBeDefined();

      const expectedMethods = [
        'signUp',
        'verifySignupToken',
        'signIn',
        'logout',
        'generateAuthUrl',
        'signInWithFullGrantAuthToken',
        'currentSessionHasFullGrant',
        'request',
        'putBlob',
        'list',
        'delete',
        'deleteIdempotent',
        'get',
        'exists',
        'generateSignupToken',
        'restoreSession',
        'subscribeUserEventStreamForPath',
      ] as const;

      expectedMethods.forEach((method) => {
        expect(typeof HomeserverService[method]).toBe('function');
      });
    });
  });

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  describe('Authentication', () => {
    describe('signUp', () => {
      it('should return session on successful signup', async () => {
        const keypair = createMockKeypair();
        const signupToken = 'valid-signup-token';
        const expectedSession = createMockSession();

        mockState.signupCookie.mockResolvedValue(expectedSession);

        const result = await HomeserverService.signUp({ keypair, signupToken });

        expect(result).toEqual({ session: expectedSession });
      });

      it('should call signer.signupCookie with signup token', async () => {
        const keypair = createMockKeypair();
        const signupToken = 'test-token';

        await HomeserverService.signUp({ keypair, signupToken });

        expect(mockState.signupCookie).toHaveBeenCalledWith(
          expect.anything(), // homeserver public key
          signupToken,
        );
      });

      it('should throw SIGNUP_FAILED error when signup fails with Error', async () => {
        const keypair = createMockKeypair();
        const signupToken = 'invalid-token';

        mockState.signupCookie.mockRejectedValue(new Error('Invalid token'));

        await expect(HomeserverService.signUp({ keypair, signupToken })).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
          operation: 'signUp',
        });
      });

      it('should throw SIGNUP_FAILED error when signup fails with non-Error', async () => {
        const keypair = createMockKeypair();
        const signupToken = 'bad-token';

        mockState.signupCookie.mockRejectedValue('string error');

        await expect(HomeserverService.signUp({ keypair, signupToken })).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
          operation: 'signUp',
        });
      });

      it('should preserve original error message in error details', async () => {
        const keypair = createMockKeypair();
        const signupToken = 'token';
        const originalMessage = 'Token expired';

        mockState.signupCookie.mockRejectedValue(new Error(originalMessage));

        try {
          await HomeserverService.signUp({ keypair, signupToken });
          expect.fail('Should have thrown');
        } catch (error) {
          // Use name check instead of instanceof due to module reset
          expect((error as Error).name).toBe('AppError');
          // The original error message becomes the error message
          expect((error as AppError).message).toBe(originalMessage);
        }
      });
    });

    describe('signUp (staging: direct homeserver URL)', () => {
      const signupToken = 'AAAA-BBBB-CCCC';
      const sessionInfoBytes = new Uint8Array([1, 2, 3, 4]);

      it('POSTs a locally signed auth token to the homeserver URL and hydrates the session', async () => {
        await withStagingHomeserverEnv(async () => {
          const keypair = createMockKeypair();
          const expectedSession = createMockSession();
          mockState.clientFetch.mockResolvedValue(new Response(sessionInfoBytes, { status: 200 }));
          mockState.restoreSession.mockResolvedValue(expectedSession);

          const result = await HomeserverService.signUp({ keypair, signupToken });

          expect(result).toEqual({ session: expectedSession });
          // Never touches the PKARR-dependent SDK signup
          expect(mockState.signupCookie).not.toHaveBeenCalled();
          expect(mockState.clientFetch).toHaveBeenCalledWith(
            expect.stringContaining(`/signup?signup_token=${signupToken}`),
            expect.objectContaining({ method: HttpMethod.POST, credentials: 'include' }),
          );
          const [url, init] = mockState.clientFetch.mock.calls[0] as [string, { body: ArrayBuffer }];
          expect(url.startsWith('https://homeserver.staging.pubky.app')).toBe(true);
          // Body is a canonical v0 root auth token (120 bytes for "/:rw")
          expect(new Uint8Array(init.body).length).toBe(120);
          // Publishes the user's record so the staging guard and Nexus can resolve it
          expect(mockState.publishHomeserverForce).toHaveBeenCalled();
          // Session is restored from the base64 of the signup response body
          expect(mockState.restoreSession).toHaveBeenCalledWith(btoa(String.fromCharCode(...sessionInfoBytes)));
        });
      });

      it('recovers a consumed invite by signing in when the account already exists', async () => {
        await withStagingHomeserverEnv(async () => {
          const keypair = createMockKeypair();
          const expectedSession = createMockSession();
          mockState.clientFetch.mockResolvedValue(new Response('token already used', { status: 400 }));
          mockState.signinCookie.mockResolvedValue(expectedSession);

          const result = await HomeserverService.signUp({ keypair, signupToken });

          expect(result).toEqual({ session: expectedSession });
          expect(mockState.publishHomeserverForce).toHaveBeenCalled();
          expect(mockState.signinCookie).toHaveBeenCalled();
        });
      });

      it('throws a non-retryable auth error when the invite is rejected and no account exists', async () => {
        await withStagingHomeserverEnv(async () => {
          const keypair = createMockKeypair();
          mockState.clientFetch.mockResolvedValue(new Response('invalid token', { status: 401 }));
          mockState.signinCookie.mockRejectedValue(new Error('no account'));

          await expect(HomeserverService.signUp({ keypair, signupToken })).rejects.toMatchObject({
            category: ErrorCategory.Auth,
            code: AuthErrorCode.INVALID_TOKEN,
          });
        });
      });

      it('throws a retryable server error when the homeserver is unreachable (invite not consumed)', async () => {
        await withStagingHomeserverEnv(async () => {
          const keypair = createMockKeypair();
          mockState.clientFetch.mockRejectedValue(new Error('network down'));

          await expect(HomeserverService.signUp({ keypair, signupToken })).rejects.toMatchObject({
            category: ErrorCategory.Server,
            code: ServerErrorCode.SERVICE_UNAVAILABLE,
          });
          expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
        });
      });

      it('throws a retryable server error when record publishing fails after a successful POST', async () => {
        await withStagingHomeserverEnv(async () => {
          const keypair = createMockKeypair();
          mockState.clientFetch.mockResolvedValue(new Response(sessionInfoBytes, { status: 200 }));
          mockState.publishHomeserverForce.mockRejectedValue(new Error('relay 429'));

          await expect(HomeserverService.signUp({ keypair, signupToken })).rejects.toMatchObject({
            category: ErrorCategory.Server,
            code: ServerErrorCode.SERVICE_UNAVAILABLE,
          });
          expect(mockState.restoreSession).not.toHaveBeenCalled();
        });
      });

      it('retries session hydration before failing with a retryable error', async () => {
        await withStagingHomeserverEnv(async () => {
          const keypair = createMockKeypair();
          const expectedSession = createMockSession();
          mockState.clientFetch.mockResolvedValue(new Response(sessionInfoBytes, { status: 200 }));
          mockState.restoreSession
            .mockRejectedValueOnce(new Error('record not propagated yet'))
            .mockResolvedValueOnce(expectedSession);

          const result = await HomeserverService.signUp({ keypair, signupToken });

          expect(result).toEqual({ session: expectedSession });
          expect(mockState.restoreSession).toHaveBeenCalledTimes(2);
        });
      });
    });

    describe('verifySignupToken', () => {
      it('should return valid when the homeserver responds with status valid', async () => {
        mockState.clientFetch.mockResolvedValue(new Response(JSON.stringify({ status: 'valid' }), { status: 200 }));

        const result = await HomeserverService.verifySignupToken('YVB2-YFRN-GDY0');

        expect(result).toBe('valid');
        expect(mockState.clientFetch).toHaveBeenCalledWith(expect.stringContaining('/signup_tokens/YVB2-YFRN-GDY0'), {
          method: HttpMethod.GET,
        });
      });

      it('should return used when the homeserver responds with status used', async () => {
        mockState.clientFetch.mockResolvedValue(new Response(JSON.stringify({ status: 'used' }), { status: 200 }));

        const result = await HomeserverService.verifySignupToken('YVB2-YFRN-GDY0');

        expect(result).toBe('used');
      });

      it('should return invalid when the homeserver responds with 404', async () => {
        mockState.clientFetch.mockResolvedValue(new Response(null, { status: 404 }));

        const result = await HomeserverService.verifySignupToken('BADC-0DE0-0000');

        expect(result).toBe('invalid');
      });

      it('should return invalid when the homeserver responds with an unexpected payload', async () => {
        mockState.clientFetch.mockResolvedValue(new Response(JSON.stringify({ status: 'unknown' }), { status: 200 }));

        const result = await HomeserverService.verifySignupToken('BADC-0DE0-0000');

        expect(result).toBe('invalid');
      });

      it('logs only the status when the verification body is not JSON', async () => {
        const windowed = '{"status":"valid"';
        mockState.clientFetch.mockResolvedValue(new Response(windowed, { status: 200 }));
        const { Logger } = await import('@/libs/logger/logger');

        const result = await HomeserverService.verifySignupToken('YVB2-YFRN-GDY0');

        expect(result).toBe('invalid');
        expect(JSON.stringify(vi.mocked(Logger.warn).mock.calls)).not.toContain(windowed);
        expect(JSON.stringify(vi.mocked(Logger.warn).mock.calls)).not.toContain('Unexpected token');
      });

      it('should rethrow when the homeserver cannot be reached', async () => {
        mockState.clientFetch.mockRejectedValue(new Error('network error'));

        await expect(HomeserverService.verifySignupToken('YVB2-YFRN-GDY0')).rejects.toThrow('network error');
      });

      it('should URL-encode the signup token', async () => {
        mockState.clientFetch.mockResolvedValue(new Response(JSON.stringify({ status: 'valid' }), { status: 200 }));

        await HomeserverService.verifySignupToken('AB CD/EF');

        expect(mockState.clientFetch).toHaveBeenCalledWith(expect.stringContaining('/signup_tokens/AB%20CD%2FEF'), {
          method: HttpMethod.GET,
        });
      });
    });

    describe('signIn', () => {
      it('should skip homeserver resolution when the deploy is not staging', async () => {
        const keypair = createMockKeypair();

        await HomeserverService.assertUserHomeserverAllowed({ publicKey: keypair.publicKey });

        expect(mockState.getHomeserverOf).not.toHaveBeenCalled();
      });

      it('should return session on successful signin', async () => {
        const keypair = createMockKeypair();
        const expectedSession = createMockSession();

        mockState.getHomeserverOf.mockResolvedValue('https://homeserver.example.com');
        mockState.signinCookie.mockResolvedValue(expectedSession);

        const result = await HomeserverService.signIn({ keypair });

        expect(mockState.signinCookie).toHaveBeenCalled();
        expect(result).toEqual({ session: expectedSession });
      });

      it('should check homeserver before signing in', async () => {
        const keypair = createMockKeypair();

        mockState.getHomeserverOf.mockResolvedValue('https://homeserver.example.com');

        await HomeserverService.signIn({ keypair });

        expect(mockState.getHomeserverOf).toHaveBeenCalledWith(keypair.publicKey);
      });

      it('should attempt to republish homeserver and return undefined when the record is provably absent', async () => {
        // NOTE: This is intentional behavior - after republishing the homeserver,
        // the method returns undefined to signal the caller should retry signin.
        // The republish is a recovery mechanism when PKARR records are stale,
        // and only fires when the lookup RESOLVED to "no record".
        const keypair = createMockKeypair();

        mockState.getHomeserverOf.mockResolvedValue(null);

        const result = await HomeserverService.signIn({ keypair });

        expect(mockState.publishHomeserverForce).toHaveBeenCalled();
        expect(result).toBeUndefined();
      });

      it('should not republish when the homeserver lookup fails outside staging', async () => {
        // A thrown lookup does not prove the record is absent — republishing on
        // it could overwrite an existing record that points elsewhere.
        const keypair = createMockKeypair();

        mockState.getHomeserverOf.mockRejectedValue(new Error('PKARR relay unavailable'));

        await expect(HomeserverService.signIn({ keypair })).rejects.toMatchObject({
          category: ErrorCategory.Server,
          operation: 'resolveHomeserverRecord',
        });
        expect(mockState.signinCookie).not.toHaveBeenCalled();
        expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
      });

      it('should map an SDK PkarrError to a retryable Network error and not republish outside staging', async () => {
        // The SDK rejects with PkarrError when the lookup itself fails instead of
        // resolving to "no record". That is not proof of absence, so no republish,
        // and the error must stay retryable for the session-restore loop.
        const keypair = createMockKeypair();

        mockState.getHomeserverOf.mockRejectedValue({ name: 'PkarrError', message: 'relay unreachable' });

        // No instanceof check: beforeEach re-imports the service after vi.resetModules(),
        // so its AppError class is a different module instance from the one imported here.
        const error = await HomeserverService.signIn({ keypair }).catch((caught: unknown) => caught);

        expect(error).toMatchObject({
          category: ErrorCategory.Network,
          code: NetworkErrorCode.CONNECTION_FAILED,
          service: ErrorService.Homeserver,
          operation: 'resolveHomeserverRecord',
        });
        expect(isRetryable(error as AppError)).toBe(true);
        expect(mockState.signinCookie).not.toHaveBeenCalled();
        expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
      });

      it('should throw SESSION_EXPIRED error when both signin and republish fail', async () => {
        // NOTE: handleError converts 401 errors to SESSION_EXPIRED (see error.utils.ts)
        const keypair = createMockKeypair();

        mockState.getHomeserverOf.mockResolvedValue(null);
        mockState.publishHomeserverForce.mockRejectedValue(new Error('Republish failed'));

        await expect(HomeserverService.signIn({ keypair })).rejects.toMatchObject({
          category: ErrorCategory.Auth,
          code: AuthErrorCode.SESSION_EXPIRED,
          operation: 'republishConfiguredHomeserver',
        });
      });

      it('should reject mismatched homeserver on staging without republishing', async () => {
        await withStagingHomeserverEnv(async () => {
          const keypair = createMockKeypair();
          mockState.getHomeserverOf.mockResolvedValue({
            z32: () => 'prod-homeserver-public-key-z32',
          });

          await expect(HomeserverService.signIn({ keypair })).rejects.toMatchObject({
            category: ErrorCategory.Auth,
            code: AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER,
          });
          expect(mockState.signinCookie).not.toHaveBeenCalled();
          expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
        });
      });

      it('should reject an absent homeserver record on staging without republishing', async () => {
        // Absence cannot prove the key belongs to this deploy — it is rejected
        // like a mismatch (deterministic, non-retryable) rather than surfaced
        // as a transient server error.
        await withStagingHomeserverEnv(async () => {
          const keypair = createMockKeypair();
          mockState.getHomeserverOf.mockResolvedValue(null);

          await expect(HomeserverService.signIn({ keypair })).rejects.toMatchObject({
            category: ErrorCategory.Auth,
            code: AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER,
          });
          expect(mockState.signinCookie).not.toHaveBeenCalled();
          expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
        });
      });

      it('should not republish when homeserver resolution fails on staging', async () => {
        await withStagingHomeserverEnv(async () => {
          const keypair = createMockKeypair();
          mockState.getHomeserverOf.mockRejectedValue(new Error('PKARR relay unavailable'));

          await expect(HomeserverService.signIn({ keypair })).rejects.toMatchObject({
            category: ErrorCategory.Server,
            operation: 'resolveHomeserverRecord',
          });
          expect(mockState.signinCookie).not.toHaveBeenCalled();
          expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
        });
      });

      it('should surface an SDK PkarrError on staging as retryable, not WRONG_ENVIRONMENT_HOMESERVER', async () => {
        await withStagingHomeserverEnv(async () => {
          const keypair = createMockKeypair();
          mockState.getHomeserverOf.mockRejectedValue({ name: 'PkarrError', message: 'relay unreachable' });

          const expected = {
            category: ErrorCategory.Network,
            code: NetworkErrorCode.CONNECTION_FAILED,
            service: ErrorService.Homeserver,
            operation: 'resolveHomeserverRecord',
          };

          // The session-restore loop calls the guard directly.
          const guardError = await HomeserverService.assertUserHomeserverAllowed({
            publicKey: keypair.publicKey,
          }).catch((caught: unknown) => caught);
          expect(guardError).toMatchObject(expected);
          expect(isRetryable(guardError as AppError)).toBe(true);

          const signInError = await HomeserverService.signIn({ keypair }).catch((caught: unknown) => caught);
          expect(signInError).toMatchObject(expected);
          expect((signInError as AppError).code).not.toBe(AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER);
          expect(mockState.signinCookie).not.toHaveBeenCalled();
          expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
        });
      });

      it('should allow signin on staging when PKARR homeserver matches configured homeserver', async () => {
        await withStagingHomeserverEnv(async () => {
          const { NETWORK_RUNTIME_DEFAULTS } = await import('@/libs/runtime-config/runtime-config.schema');
          const keypair = createMockKeypair();
          const expectedSession = createMockSession();
          mockState.getHomeserverOf.mockResolvedValue({
            z32: () => NETWORK_RUNTIME_DEFAULTS.homeserver,
          });
          mockState.signinCookie.mockResolvedValue(expectedSession);

          const result = await HomeserverService.signIn({ keypair });

          expect(result).toEqual({ session: expectedSession });
          expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
        });
      });

      it('should keep the staging guard active when homeserver config drifts from the canonical defaults', async () => {
        // Regression: the guard is driven by the declared PUBKY_RUNTIME_ENV, not
        // by config equality with the compiled-in staging defaults — drift used
        // to silently disable it and re-enable the force-republish path.
        await withStagingHomeserverEnv(
          async () => {
            const keypair = createMockKeypair();
            mockState.getHomeserverOf.mockResolvedValue({
              z32: () => 'prod-homeserver-public-key-z32',
            });

            await expect(HomeserverService.signIn({ keypair })).rejects.toMatchObject({
              category: ErrorCategory.Auth,
              code: AuthErrorCode.WRONG_ENVIRONMENT_HOMESERVER,
            });
            expect(mockState.signinCookie).not.toHaveBeenCalled();
            expect(mockState.publishHomeserverForce).not.toHaveBeenCalled();
          },
          { keepTestHomeserver: true },
        );
      });
    });

    describe('restoreSession', () => {
      it('should forward the export to the SDK and return the restored session', async () => {
        const expectedSession = createMockSession();
        mockState.restoreSession.mockResolvedValue(expectedSession);

        const result = await HomeserverService.restoreSession({ sessionExport: 'exported-session' });

        expect(mockState.restoreSession).toHaveBeenCalledWith('exported-session');
        expect(result).toBe(expectedSession);
      });

      it('should map an SDK AuthenticationError to SESSION_EXPIRED', async () => {
        mockState.restoreSession.mockRejectedValue({ name: 'AuthenticationError', message: 'Session expired' });

        await expect(HomeserverService.restoreSession({ sessionExport: 'exported-session' })).rejects.toMatchObject({
          category: ErrorCategory.Auth,
          code: AuthErrorCode.SESSION_EXPIRED,
          service: ErrorService.Homeserver,
          operation: 'restoreSession',
        });
      });

      it('should map an SDK PkarrError to a retryable Network error tagged restoreSession', async () => {
        mockState.restoreSession.mockRejectedValue({ name: 'PkarrError', message: 'relay unreachable' });

        const error = await HomeserverService.restoreSession({ sessionExport: 'exported-session' }).catch(
          (caught: unknown) => caught,
        );

        expect(error).toMatchObject({
          category: ErrorCategory.Network,
          code: NetworkErrorCode.CONNECTION_FAILED,
          service: ErrorService.Homeserver,
          operation: 'restoreSession',
        });
        expect(isRetryable(error as AppError)).toBe(true);
      });

      it('should map a plain Error to a Server error', async () => {
        mockState.restoreSession.mockRejectedValue(new Error('boom'));

        await expect(HomeserverService.restoreSession({ sessionExport: 'exported-session' })).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
          operation: 'restoreSession',
        });
      });
    });

    describe('logout', () => {
      it('should sign out using the Session object', async () => {
        const session = createMockSession();

        await HomeserverService.logout({ session });

        expect(mockState.sessionSignout).toHaveBeenCalledOnce();
      });

      it('should throw error when signout fails', async () => {
        const session = createMockSession();
        mockState.sessionSignout.mockRejectedValue(new Error('Network error'));

        await expect(HomeserverService.logout({ session })).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });
    });

    describe('generateAuthUrl', () => {
      it('should return authorizationUrl and awaitApproval promise', async () => {
        const result = await HomeserverService.generateAuthUrl();

        expect(result).toHaveProperty('authorizationUrl');
        expect(result).toHaveProperty('awaitApproval');
        expect(result).toHaveProperty('cancelAuthFlow');
        expect(typeof result.authorizationUrl).toBe('string');
        expect(result.awaitApproval).toBeInstanceOf(Promise);
      });

      it('should cancel polling before first poll when cancelAuthFlow is called immediately', async () => {
        vi.useFakeTimers();
        try {
          const tryPollOnce = vi.fn().mockResolvedValue(undefined);
          const free = vi.fn();
          mockState.startCookieAuthFlow.mockReturnValue({
            authorizationUrl: 'https://auth.example.com/authorize',
            tryPollOnce,
            free,
          });

          const result = await HomeserverService.generateAuthUrl();
          const approvalPromise = result.awaitApproval;
          const rejection = expect(approvalPromise).rejects.toMatchObject({ name: 'AuthFlowCanceled' });

          result.cancelAuthFlow();
          await vi.runAllTimersAsync();

          await rejection;
          expect(tryPollOnce).not.toHaveBeenCalled();
          expect(free).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
        }
      });

      it('should reject with SESSION_EXPIRED when tryPollOnce throws (SDK exhausted its retry budget)', async () => {
        vi.useFakeTimers();
        try {
          const relayError = { name: 'RequestError', message: 'Gateway Timeout', data: { statusCode: 504 } };
          const tryPollOnce = vi.fn().mockRejectedValue(relayError);
          const free = vi.fn();
          mockState.startCookieAuthFlow.mockReturnValue({
            authorizationUrl: 'https://auth.example.com/authorize',
            tryPollOnce,
            free,
          });

          const result = await HomeserverService.generateAuthUrl();
          const approvalPromise = result.awaitApproval;
          const rejection = expect(approvalPromise).rejects.toMatchObject({
            code: AuthErrorCode.SESSION_EXPIRED,
          });

          await vi.advanceTimersByTimeAsync(0);
          await rejection;

          // Loop must not retry on a dead flow; one throw is terminal.
          expect(tryPollOnce).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
        }
      });

      it('should call startCookieAuthFlow with default capabilities', async () => {
        await HomeserverService.generateAuthUrl();

        expect(mockState.startCookieAuthFlow).toHaveBeenCalledWith(
          '/pub/pubky.app/:rw,/pub/paykit/:rw,/priv/pubky.app/:rw', // Default capabilities: one grant covers app + messaging + private sync
          'signin-kind', // AuthFlowKind.signin()
          expect.stringContaining('/inbox'), // HTTP relay (Pubky 0.7+ inbox endpoint)
        );
      });

      it('should call startCookieAuthFlow with custom capabilities when provided', async () => {
        const customCaps = '/custom/path/:r';

        await HomeserverService.generateAuthUrl(customCaps);

        expect(mockState.startCookieAuthFlow).toHaveBeenCalledWith(
          customCaps,
          'signin-kind',
          expect.stringContaining('/inbox'),
        );
      });

      it('should throw error when flow fails', async () => {
        mockState.startCookieAuthFlow.mockImplementation(() => {
          throw new Error('Flow initialization failed');
        });

        await expect(HomeserverService.generateAuthUrl()).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });
    });

    describe('signInWithFullGrantAuthToken', () => {
      const z32 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const fullCaps = CAPABILITIES.split(',');
      const bytes = new Uint8Array([9, 8, 7]);

      beforeEach(() => {
        mockState.authTokenFromBytes.mockReturnValue({
          capabilities: fullCaps,
          publicKey: { z32: () => z32 },
        });
        mockState.restoreSession.mockResolvedValue(createMockSession());
      });

      it('POSTs to the session endpoint after a full-grant capability check', async () => {
        mockState.clientFetch.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

        await HomeserverService.signInWithFullGrantAuthToken(bytes);

        expect(mockState.authTokenFromBytes).toHaveBeenCalledWith(bytes);
        expect(mockState.clientFetch).toHaveBeenCalledWith(
          `https://_pubky.${z32}/session`,
          expect.objectContaining({ method: 'POST', credentials: 'include', body: bytes }),
        );
        expect(mockState.restoreSession).toHaveBeenCalled();
      });

      it('hydrates with the same standard padded base64 alphabet session.export() uses', async () => {
        // 0xfb 0xff 0xfe encodes to '+//+' ONLY under the standard base64
        // alphabet (base64url would be '-__-'); a trailing 0xfb forces '='
        // padding ('+w=='). Both are what the d.ts means by "base64" — the
        // alphabet restore accepted on staging (single-approval.md §9 step 0,
        // recorded as empirical) is pinned here in the helper path.
        mockState.clientFetch
          .mockResolvedValueOnce(new Response(new Uint8Array([0xfb, 0xff, 0xfe]), { status: 200 }))
          .mockResolvedValueOnce(new Response(new Uint8Array([0xfb]), { status: 200 }));

        await HomeserverService.signInWithFullGrantAuthToken(bytes);
        await HomeserverService.signInWithFullGrantAuthToken(bytes);

        expect(mockState.restoreSession).toHaveBeenNthCalledWith(1, '+//+');
        expect(mockState.restoreSession).toHaveBeenNthCalledWith(2, '+w==');
      });

      it('accepts a reordered full grant (order-insensitive set equality)', async () => {
        mockState.authTokenFromBytes.mockReturnValue({
          capabilities: [...fullCaps].reverse(),
          publicKey: { z32: () => z32 },
        });
        mockState.clientFetch.mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }));

        await HomeserverService.signInWithFullGrantAuthToken(bytes);

        expect(mockState.clientFetch).toHaveBeenCalled();
      });

      it('refuses empty-capability bytes before POSTing /session', async () => {
        mockState.authTokenFromBytes.mockReturnValue({
          capabilities: [],
          publicKey: { z32: () => z32 },
        });

        await expect(HomeserverService.signInWithFullGrantAuthToken(bytes)).rejects.toMatchObject({
          category: ErrorCategory.Validation,
          code: ValidationErrorCode.INVALID_INPUT,
        });
        expect(mockState.clientFetch).not.toHaveBeenCalled();
      });

      it('refuses a missing capability before POSTing /session', async () => {
        mockState.authTokenFromBytes.mockReturnValue({
          capabilities: fullCaps.slice(0, 2),
          publicKey: { z32: () => z32 },
        });

        await expect(HomeserverService.signInWithFullGrantAuthToken(bytes)).rejects.toMatchObject({
          code: ValidationErrorCode.INVALID_INPUT,
        });
        expect(mockState.clientFetch).not.toHaveBeenCalled();
      });

      it('treats homeserver AlreadyUsed as GET /session hydrate, not failure', async () => {
        // STATUS PIN NOTE: 400 is what the Node-side run recorded for a
        // homeserver replay; the WASM-path status is recorded as UNPROVEN in
        // single-approval.md §9. The helper must not depend on the exact
        // number — it probes GET /session after ANY non-ok POST (see the
        // next test), so this 400 is illustrative, not load-bearing.
        mockState.clientFetch
          .mockResolvedValueOnce(new Response('already used', { status: 400 }))
          .mockResolvedValueOnce(new Response(new Uint8Array([4, 5, 6]), { status: 200 }));

        await HomeserverService.signInWithFullGrantAuthToken(bytes);

        expect(mockState.clientFetch).toHaveBeenNthCalledWith(
          2,
          `https://_pubky.${z32}/session`,
          expect.objectContaining({ method: 'GET', credentials: 'include' }),
        );
        expect(mockState.restoreSession).toHaveBeenCalled();
      });

      it('probes GET /session after any non-ok POST status, not just the recorded 400', async () => {
        for (const status of [401, 409, 500]) {
          mockState.clientFetch.mockReset();
          mockState.restoreSession.mockClear();
          mockState.clientFetch
            .mockResolvedValueOnce(new Response('nope', { status }))
            .mockResolvedValueOnce(new Response(new Uint8Array([4, 5, 6]), { status: 200 }));

          await HomeserverService.signInWithFullGrantAuthToken(bytes);

          expect(mockState.clientFetch).toHaveBeenNthCalledWith(
            2,
            `https://_pubky.${z32}/session`,
            expect.objectContaining({ method: 'GET', credentials: 'include' }),
          );
          expect(mockState.restoreSession).toHaveBeenCalled();
        }
      });

      it('fails sign-in when restore fails after a 2xx POST, without a fallback GET', async () => {
        mockState.clientFetch.mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }));
        mockState.restoreSession.mockRejectedValueOnce(new Error('restore failed'));

        await expect(HomeserverService.signInWithFullGrantAuthToken(bytes)).rejects.toMatchObject({
          message: 'Sign-in failed. Scan again.',
        });
        // Exactly one call: the POST. No GET probe follows a restore failure
        // (the cookie may be missing; a probe would mask that).
        expect(mockState.clientFetch).toHaveBeenCalledTimes(1);
      });

      it('never puts the AuthToken bytes into error context or logger arguments', async () => {
        // Distinctive, recognizable bytes: their base64 form and their
        // comma-joined decimal form must appear nowhere observable.
        const sensitive = new Uint8Array([170, 187, 204, 221, 238]);
        const asBase64 = bytesToBase64(sensitive);
        const asDecimal = sensitive.join(',');
        mockState.clientFetch
          .mockResolvedValueOnce(new Response('already used', { status: 400 }))
          .mockResolvedValueOnce(new Response('no session', { status: 404 }));

        const error = await HomeserverService.signInWithFullGrantAuthToken(sensitive).catch((caught) => caught);

        expect(error).toMatchObject({ code: AuthErrorCode.UNAUTHORIZED, context: { stage: 'no-session' } });
        const observable = JSON.stringify({
          context: (error as AppError).context,
          loggerCalls: [
            ...vi.mocked(Logger.error).mock.calls,
            ...vi.mocked(Logger.warn).mock.calls,
            ...vi.mocked(Logger.info).mock.calls,
            ...vi.mocked(Logger.debug).mock.calls,
          ],
        });
        expect(observable).not.toContain(asBase64);
        expect(observable).not.toContain(asDecimal);
      });
    });
  });

  // ===========================================================================
  // DATA OPERATIONS
  // ===========================================================================

  describe('Data Operations', () => {
    describe('request', () => {
      describe('GET requests', () => {
        it('should return parsed JSON for successful GET', async () => {
          mockState.currentSession = createMockSession();
          const testData = { name: 'test', value: 123 };
          mockState.sessionStorageGet.mockResolvedValue(new Response(JSON.stringify(testData), { status: 200 }));

          const result = await HomeserverService.request<typeof testData>({
            method: HttpMethod.GET,
            url: 'pubky://user/pub/data.json',
          });

          expect(result).toEqual(testData);
          expect(mockState.sessionStorageGet).toHaveBeenCalledWith('/pub/data.json');
        });

        it('should return undefined for empty GET response', async () => {
          mockState.currentSession = createMockSession();
          mockState.sessionStorageGet.mockResolvedValue(new Response('', { status: 200 }));

          const result = await HomeserverService.request({
            method: HttpMethod.GET,
            url: 'pubky://user/pub/empty.json',
          });

          expect(result).toBeUndefined();
        });

        it('should return undefined for invalid JSON response', async () => {
          mockState.currentSession = createMockSession();
          mockState.sessionStorageGet.mockResolvedValue(new Response('not-valid-json', { status: 200 }));

          const result = await HomeserverService.request({
            method: HttpMethod.GET,
            url: 'pubky://user/pub/invalid.json',
          });

          expect(result).toBeUndefined();
        });
      });

      describe('PUT requests', () => {
        it('should send JSON body for PUT request', async () => {
          mockState.currentSession = createMockSession();
          const bodyData = { name: 'new-value' };
          await HomeserverService.request({
            method: HttpMethod.PUT,
            url: 'pubky://user/pub/data.json',
            bodyJson: bodyData,
          });

          expect(mockState.sessionStoragePutJson).toHaveBeenCalledWith('/pub/data.json', bodyData);
        });

        it('should throw INVALID_INPUT when PUT is attempted without a session on a pubky:// address', async () => {
          mockState.currentSession = null;
          await expect(
            HomeserverService.request({
              method: HttpMethod.PUT,
              url: 'pubky://someone/pub/data.json',
              bodyJson: { ok: true },
            }),
          ).rejects.toMatchObject({
            category: ErrorCategory.Validation,
            code: ValidationErrorCode.INVALID_INPUT,
          });
        });

        it('should return undefined for successful PUT', async () => {
          mockState.currentSession = createMockSession();

          const result = await HomeserverService.request({
            method: HttpMethod.PUT,
            url: 'pubky://user/pub/data.json',
            bodyJson: {
              data: 'test',
            },
          });

          expect(result).toBeUndefined();
        });
      });

      describe('DELETE requests', () => {
        it('should send DELETE request without body', async () => {
          mockState.currentSession = createMockSession();

          await HomeserverService.request({ method: HttpMethod.DELETE, url: 'pubky://user/pub/data.json' });

          expect(mockState.sessionStorageDelete).toHaveBeenCalledWith('/pub/data.json');
        });
      });

      describe('Error handling', () => {
        it('should throw NOT_FOUND error for 404 response', async () => {
          mockState.currentSession = createMockSession();
          mockState.sessionStorageGet.mockResolvedValue(
            new Response('Not Found', { status: 404, statusText: 'Not Found' }),
          );

          await expect(
            HomeserverService.request({ method: HttpMethod.GET, url: 'pubky://user/pub/missing.json' }),
          ).rejects.toMatchObject({
            category: ErrorCategory.Client,
            code: ClientErrorCode.NOT_FOUND,
          });
        });

        it('should throw SESSION_EXPIRED error for 401 response', async () => {
          mockState.currentSession = createMockSession();
          mockState.sessionStorageGet.mockResolvedValue(
            new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
          );

          await expect(
            HomeserverService.request({ method: HttpMethod.GET, url: 'pubky://user/pub/data.json' }),
          ).rejects.toMatchObject({
            category: ErrorCategory.Auth,
            code: AuthErrorCode.SESSION_EXPIRED,
          });
        });

        it('should throw INTERNAL_ERROR for network errors', async () => {
          mockState.currentSession = createMockSession();
          mockState.sessionStorageGet.mockRejectedValue(new Error('Network error'));

          await expect(
            HomeserverService.request({ method: HttpMethod.GET, url: 'pubky://user/pub/data.json' }),
          ).rejects.toMatchObject({
            category: ErrorCategory.Server,
            code: ServerErrorCode.INTERNAL_ERROR,
          });
        });
      });
    });

    describe('putBlob', () => {
      it('should upload binary data successfully', async () => {
        mockState.currentSession = createMockSession();
        const blobData = new Uint8Array([1, 2, 3, 4, 5]);

        await HomeserverService.putBlob({ url: 'pubky://user/pub/avatar.png', blob: blobData });

        expect(mockState.sessionStoragePutBytes).toHaveBeenCalledWith('/pub/avatar.png', blobData);
      });

      it('should throw PAYLOAD_TOO_LARGE error for 413 response', async () => {
        mockState.currentSession = createMockSession();
        const blobData = new Uint8Array([1, 2, 3]);
        mockState.sessionStoragePutBytes.mockRejectedValue({
          name: 'RequestError',
          message: 'Payload Too Large',
          data: { statusCode: 413 },
        });

        await expect(
          HomeserverService.putBlob({ url: 'pubky://user/pub/large.bin', blob: blobData }),
        ).rejects.toMatchObject({
          category: ErrorCategory.Client,
          code: ClientErrorCode.PAYLOAD_TOO_LARGE,
        });
      });

      it('should throw SESSION_EXPIRED error for 401 response', async () => {
        mockState.currentSession = createMockSession();
        const blobData = new Uint8Array([1, 2, 3]);
        mockState.sessionStoragePutBytes.mockRejectedValue({
          name: 'AuthenticationError',
          message: 'Session expired',
          data: { statusCode: 401 },
        });

        await expect(
          HomeserverService.putBlob({ url: 'pubky://user/pub/avatar.png', blob: blobData }),
        ).rejects.toMatchObject({
          category: ErrorCategory.Auth,
          code: AuthErrorCode.SESSION_EXPIRED,
        });
      });

      it('should throw INVALID_INPUT when uploading blob without a session to a pubky:// address', async () => {
        mockState.currentSession = null;
        const blobData = new Uint8Array([1, 2, 3]);

        await expect(
          HomeserverService.putBlob({ url: 'pubky://someone/pub/avatar.png', blob: blobData }),
        ).rejects.toMatchObject({
          category: ErrorCategory.Validation,
          code: ValidationErrorCode.INVALID_INPUT,
        });
      });
    });

    describe('list', () => {
      it('should return array of file URLs', async () => {
        const mockFiles = ['file1.json', 'file2.json', 'file3.json'];
        mockState.publicStorageList.mockResolvedValue(mockFiles);

        const result = await HomeserverService.list({ baseDirectory: 'pubky://user/pub/posts/' });

        expect(result).toEqual(mockFiles);
      });

      it('should use session.storage.list for owned directories when session is set', async () => {
        mockState.currentSession = createMockSession();
        const mockFiles = ['pubky://user/pub/posts/file1.json', 'pubky://user/pub/posts/file2.json'];
        mockState.sessionStorageList.mockResolvedValue(mockFiles);

        const result = await HomeserverService.list({ baseDirectory: 'pubky://user/pub/posts/' });

        expect(result).toEqual(mockFiles);
        expect(mockState.sessionStorageList).toHaveBeenCalledWith(
          '/pub/posts/',
          null, // cursor
          false, // reverse
          500, // limit
          false, // shallow
        );
        expect(mockState.publicStorageList).not.toHaveBeenCalled();
      });

      it('should call list with default parameters', async () => {
        mockState.publicStorageList.mockResolvedValue([]);

        await HomeserverService.list({ baseDirectory: 'pubky://user/pub/posts/' });

        expect(mockState.publicStorageList).toHaveBeenCalledWith(
          'pubky://user/pub/posts/',
          null, // cursor
          false, // reverse
          500, // limit
          false, // shallow
        );
      });

      it('should pass pagination parameters to list', async () => {
        mockState.publicStorageList.mockResolvedValue([]);

        await HomeserverService.list({
          baseDirectory: 'pubky://user/pub/posts/',
          cursor: 'cursor123',
          reverse: true,
          limit: 100,
        });

        expect(mockState.publicStorageList).toHaveBeenCalledWith(
          'pubky://user/pub/posts/',
          'cursor123',
          true,
          100,
          false,
        );
      });

      it('should throw INTERNAL_ERROR on list failure', async () => {
        mockState.publicStorageList.mockRejectedValue(new Error('List failed'));

        await expect(HomeserverService.list({ baseDirectory: 'pubky://user/pub/posts/' })).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });

      it('should return empty array when directory returns 404', async () => {
        mockState.publicStorageList.mockRejectedValue({ data: { statusCode: 404 } });

        const result = await HomeserverService.list({ baseDirectory: 'pubky://user/pub/missing/' });

        expect(result).toEqual([]);
      });
    });

    describe('listAll', () => {
      const baseDirectory = 'pubky://user/pub/posts/';
      const makeFiles = (count: number, offset = 0) =>
        Array.from({ length: count }, (_, i) => `${baseDirectory}file${String(offset + i).padStart(4, '0')}`);

      it('should return all files in a single page when below the page limit', async () => {
        const files = makeFiles(3);
        mockState.publicStorageList.mockResolvedValue(files);

        const result = await HomeserverService.listAll({ baseDirectory });

        expect(result).toEqual(files);
        expect(mockState.publicStorageList).toHaveBeenCalledTimes(1);
        expect(mockState.publicStorageList).toHaveBeenCalledWith(baseDirectory, null, false, 500, false);
      });

      it('should paginate with the last URL as cursor until a short page is returned', async () => {
        const page1 = makeFiles(500);
        const page2 = makeFiles(200, 500);
        mockState.publicStorageList.mockImplementation((_dir: string, cursor: string | null) =>
          Promise.resolve(cursor === null ? page1 : page2),
        );

        const result = await HomeserverService.listAll({ baseDirectory });

        expect(result).toEqual([...page1, ...page2]);
        expect(mockState.publicStorageList).toHaveBeenCalledTimes(2);
        expect(mockState.publicStorageList).toHaveBeenNthCalledWith(2, baseDirectory, page1[499], false, 500, false);
      });

      it('should stop after an empty page when the file count is an exact multiple of the page size', async () => {
        const page1 = makeFiles(500);
        mockState.publicStorageList.mockImplementation((_dir: string, cursor: string | null) =>
          Promise.resolve(cursor === null ? page1 : []),
        );

        const result = await HomeserverService.listAll({ baseDirectory });

        expect(result).toEqual(page1);
        expect(mockState.publicStorageList).toHaveBeenCalledTimes(2);
      });

      it('should propagate list failures', async () => {
        mockState.publicStorageList.mockRejectedValue(new Error('List failed'));

        await expect(HomeserverService.listAll({ baseDirectory })).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });
    });

    describe('delete', () => {
      it('should call request with DELETE method', async () => {
        mockState.currentSession = createMockSession();

        await HomeserverService.delete('pubky://user/pub/file.json');

        expect(mockState.sessionStorageDelete).toHaveBeenCalledWith('/pub/file.json');
      });

      it('should throw FORBIDDEN error on delete failure with 403', async () => {
        // NOTE: For owned paths, delete uses session.storage.delete
        // handleError extracts status code from error.data.statusCode if available
        mockState.currentSession = createMockSession();
        mockState.sessionStorageDelete.mockRejectedValue({
          name: 'RequestError',
          message: 'Forbidden',
          data: { statusCode: 403 },
        });

        await expect(HomeserverService.delete('pubky://user/pub/protected.json')).rejects.toMatchObject({
          category: ErrorCategory.Auth,
          code: AuthErrorCode.FORBIDDEN,
        });
      });
    });

    describe('deleteIdempotent', () => {
      const testUrl = 'pubky://user/pub/pubky.app/files/file123';

      it('should resolve on a successful first delete', async () => {
        mockState.currentSession = createMockSession();

        await expect(HomeserverService.deleteIdempotent(testUrl)).resolves.toBeUndefined();

        expect(mockState.sessionStorageDelete).toHaveBeenCalledTimes(1);
        expect(mockState.sessionStorageDelete).toHaveBeenCalledWith('/pub/pubky.app/files/file123');
      });

      it('should treat 404 as success without retrying (already gone = desired end state)', async () => {
        mockState.currentSession = createMockSession();
        mockState.sessionStorageDelete.mockRejectedValue({
          name: 'RequestError',
          message: 'Not Found',
          data: { statusCode: 404 },
        });

        await expect(HomeserverService.deleteIdempotent(testUrl)).resolves.toBeUndefined();

        expect(mockState.sessionStorageDelete).toHaveBeenCalledTimes(1);
      });

      it('should retry a transient failure and resolve once a later attempt succeeds', async () => {
        vi.useFakeTimers();
        try {
          mockState.currentSession = createMockSession();
          mockState.sessionStorageDelete
            .mockRejectedValueOnce({ name: 'RequestError', message: 'Bad Gateway', data: { statusCode: 502 } })
            .mockResolvedValueOnce(undefined);

          const pending = HomeserverService.deleteIdempotent(testUrl);
          await vi.runAllTimersAsync(); // skips the 500ms backoff between attempts

          await expect(pending).resolves.toBeUndefined();
          expect(mockState.sessionStorageDelete).toHaveBeenCalledTimes(2);
        } finally {
          vi.useRealTimers();
        }
      });

      it('should throw the last error after exhausting all 3 attempts on persistent failure', async () => {
        vi.useFakeTimers();
        try {
          mockState.currentSession = createMockSession();
          mockState.sessionStorageDelete.mockRejectedValue({
            name: 'RequestError',
            message: 'Service Unavailable',
            data: { statusCode: 503 },
          });

          const pending = HomeserverService.deleteIdempotent(testUrl);
          // Attach the rejection expectation before advancing timers so the
          // rejection is never unhandled
          const rejection = expect(pending).rejects.toMatchObject({
            category: ErrorCategory.Server,
            code: ServerErrorCode.SERVICE_UNAVAILABLE,
          });
          await vi.runAllTimersAsync();
          await rejection;

          expect(mockState.sessionStorageDelete).toHaveBeenCalledTimes(3);
        } finally {
          vi.useRealTimers();
        }
      });

      it('should not retry non-transient auth failures beyond the retry budget on 403', async () => {
        // 403 is not 404, so it goes through the retry loop like any other
        // failure and still surfaces after the budget is spent
        vi.useFakeTimers();
        try {
          mockState.currentSession = createMockSession();
          mockState.sessionStorageDelete.mockRejectedValue({
            name: 'RequestError',
            message: 'Forbidden',
            data: { statusCode: 403 },
          });

          const pending = HomeserverService.deleteIdempotent(testUrl);
          const rejection = expect(pending).rejects.toMatchObject({
            category: ErrorCategory.Auth,
            code: AuthErrorCode.FORBIDDEN,
          });
          await vi.runAllTimersAsync();
          await rejection;

          expect(mockState.sessionStorageDelete).toHaveBeenCalledTimes(3);
        } finally {
          vi.useRealTimers();
        }
      });
    });

    describe('get', () => {
      it('should use publicStorage.get for fetching', async () => {
        const testUrl = 'pubky://user/pub/public.json';
        const mockResponse = new Response(JSON.stringify({ data: 'public' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        mockState.publicStorageGet.mockResolvedValue(mockResponse);

        const result = await HomeserverService.get(testUrl);

        expect(mockState.publicStorageGet).toHaveBeenCalledWith(testUrl);
        expect(result).toBeInstanceOf(Response);
        const jsonData = await result.json();
        expect(jsonData).toEqual({ data: 'public' });
      });

      it('should use session.storage.get for owned paths when session is set', async () => {
        mockState.currentSession = createMockSession();
        const testUrl = 'pubky://user/pub/private.json';
        const mockResponse = new Response(JSON.stringify({ data: 'private' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        mockState.sessionStorageGet.mockResolvedValue(mockResponse);

        const result = await HomeserverService.get(testUrl);

        expect(mockState.sessionStorageGet).toHaveBeenCalledWith('/pub/private.json');
        expect(mockState.publicStorageGet).not.toHaveBeenCalled();
        expect(result).toBeInstanceOf(Response);
        const jsonData = await result.json();
        expect(jsonData).toEqual({ data: 'private' });
      });

      it('should wrap errors from publicStorage.get as AppError', async () => {
        const testUrl = 'pubky://user/pub/data.json';
        const networkError = new Error('Network request failed');
        mockState.publicStorageGet.mockRejectedValue(networkError);

        await expect(HomeserverService.get(testUrl)).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });
    });

    describe('exists', () => {
      const testUrl = 'pubky://user/pub/resource.json';

      it('should return true for an owned resource that exists', async () => {
        mockState.currentSession = createMockSession();
        mockState.sessionStorageExists.mockResolvedValue(true);

        await expect(HomeserverService.exists(testUrl)).resolves.toBe(true);

        expect(mockState.sessionStorageExists).toHaveBeenCalledWith('/pub/resource.json');
        expect(mockState.publicStorageExists).not.toHaveBeenCalled();
      });

      it('should return false without error logging when an owned resource is missing', async () => {
        mockState.currentSession = createMockSession();
        mockState.sessionStorageExists.mockResolvedValue(false);

        await expect(HomeserverService.exists(testUrl)).resolves.toBe(false);

        expect(Logger.error).not.toHaveBeenCalled();
      });

      it('should normalize unexpected owned-storage failures', async () => {
        mockState.currentSession = createMockSession();
        mockState.sessionStorageExists.mockRejectedValue(new Error('Network failure'));

        await expect(HomeserverService.exists(testUrl)).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });

      it('should preserve session-expiration handling for owned-storage failures', async () => {
        mockState.currentSession = createMockSession();
        mockState.sessionStorageExists.mockRejectedValue({
          name: 'RequestError',
          message: 'Session expired',
          data: { statusCode: 401 },
        });

        await expect(HomeserverService.exists(testUrl)).rejects.toMatchObject({
          category: ErrorCategory.Auth,
          code: AuthErrorCode.SESSION_EXPIRED,
        });
      });

      it('should use publicStorage.exists when the resource is not owned', async () => {
        mockState.publicStorageExists.mockResolvedValue(true);

        await expect(HomeserverService.exists(testUrl)).resolves.toBe(true);

        expect(mockState.publicStorageExists).toHaveBeenCalledWith(testUrl);
        expect(mockState.sessionStorageExists).not.toHaveBeenCalled();
      });

      it('should return false without error logging when a public resource is missing', async () => {
        mockState.publicStorageExists.mockResolvedValue(false);

        await expect(HomeserverService.exists(testUrl)).resolves.toBe(false);

        expect(Logger.error).not.toHaveBeenCalled();
      });

      it('should normalize unexpected public-storage failures', async () => {
        mockState.publicStorageExists.mockRejectedValue(new Error('Network failure'));

        await expect(HomeserverService.exists(testUrl)).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });

      it('should return true for a successful HTTP response', async () => {
        const httpUrl = 'https://example.com/resource.json';
        mockState.clientFetch.mockResolvedValue(new Response('{}', { status: 200 }));

        await expect(HomeserverService.exists(httpUrl)).resolves.toBe(true);

        expect(mockState.clientFetch).toHaveBeenCalledWith(httpUrl);
      });

      it('should return false without error logging for an HTTP 404', async () => {
        mockState.clientFetch.mockResolvedValue(new Response('', { status: 404 }));

        await expect(HomeserverService.exists('https://example.com/missing.json')).resolves.toBe(false);

        expect(Logger.error).not.toHaveBeenCalled();
      });

      it('should normalize an unexpected HTTP response', async () => {
        mockState.clientFetch.mockResolvedValue(new Response('Server error', { status: 500 }));

        await expect(HomeserverService.exists('https://example.com/broken.json')).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
      });

      it('should preserve session-expiration handling for HTTP responses', async () => {
        mockState.clientFetch.mockResolvedValue(new Response('Session expired', { status: 401 }));

        await expect(HomeserverService.exists('https://example.com/private.json')).rejects.toMatchObject({
          category: ErrorCategory.Auth,
          code: AuthErrorCode.SESSION_EXPIRED,
        });
      });
    });
  });

  // ===========================================================================
  // EDGE CASES & ERROR HANDLING
  // ===========================================================================

  describe('Edge Cases & Error Handling', () => {
    describe('handleError (private)', () => {
      it('should re-throw AppError instances without wrapping', async () => {
        const { Err: FreshErr } = await import('@/libs/error/error.factories');
        const appError = FreshErr.auth(AuthErrorCode.UNAUTHORIZED, 'Already an AppError', {
          service: ErrorService.Homeserver,
          operation: 'test',
        });
        mockState.signupCookie.mockRejectedValue(appError);

        try {
          await HomeserverService.signUp({
            keypair: createMockKeypair(),
            signupToken: 'token',
          });
          expect.fail('Should have thrown');
        } catch (error) {
          // Should be the exact same error instance (not wrapped)
          expect(error).toBe(appError);
          expect((error as AppError).category).toBe(ErrorCategory.Auth);
          expect((error as AppError).code).toBe(AuthErrorCode.UNAUTHORIZED);
          expect((error as AppError).message).toBe('Already an AppError');
        }
      });
    });

    describe('Session expiration handling', () => {
      it('should include endpoint in SESSION_EXPIRED error context', async () => {
        const testUrl = 'pubky://user/pub/data.json';
        mockState.currentSession = createMockSession();
        mockState.sessionStorageGet.mockResolvedValue(new Response('Session expired', { status: 401 }));

        try {
          await HomeserverService.request({ method: HttpMethod.GET, url: testUrl });
          expect.fail('Should have thrown');
        } catch (error) {
          // Use name check instead of instanceof due to module reset
          expect((error as Error).name).toBe('AppError');
          expect((error as AppError).context?.endpoint).toContain('user/pub/data.json');
        }
      });

      it('should use custom error message from 401 response body', async () => {
        const customMessage = 'Your session has expired, please login again';
        mockState.currentSession = createMockSession();
        mockState.sessionStorageGet.mockResolvedValue(new Response(customMessage, { status: 401 }));

        try {
          await HomeserverService.request({ method: HttpMethod.GET, url: 'pubky://user/pub/data.json' });
          expect.fail('Should have thrown');
        } catch (error) {
          // Use name check instead of instanceof due to module reset
          expect((error as Error).name).toBe('AppError');
          expect((error as AppError).message).toBe(customMessage);
        }
      });
    });

    describe('generateSignupToken (via API route)', () => {
      it('should fetch token from server-side API route', async () => {
        const expectedToken = 'generated-signup-token-123';
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ token: expectedToken }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

        const result = await HomeserverService.generateSignupToken();

        expect(mockFetch).toHaveBeenCalledWith('/api/dev/signup-token', { method: 'GET' });
        expect(result).toBe(expectedToken);
      });

      it('should throw FORBIDDEN error for 403 response', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

        await expect(HomeserverService.generateSignupToken()).rejects.toMatchObject({
          category: ErrorCategory.Auth,
          code: AuthErrorCode.FORBIDDEN,
        });
      });

      it('should throw UNEXPECTED_ERROR when no token received', async () => {
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

        await expect(HomeserverService.generateSignupToken()).rejects.toMatchObject({
          category: ErrorCategory.Server,
          code: ServerErrorCode.UNKNOWN_ERROR,
        });
      });

      it('should return token from JSON response', async () => {
        const expectedToken = 'token-from-json';
        mockFetch.mockResolvedValue(
          new Response(JSON.stringify({ token: expectedToken }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

        const result = await HomeserverService.generateSignupToken();

        expect(result).toBe(expectedToken);
      });
    });

    describe('subscribeUserEventStreamForPath', () => {
      it('normalizes SDK events and disposes raw WASM objects internally', async () => {
        const free = vi.fn();
        const path = vi.fn().mockReturnThis();
        const live = vi.fn().mockReturnThis();
        const subscribe = vi.fn().mockResolvedValue(
          new ReadableStream({
            start(controller) {
              controller.enqueue({ cursor: 'cursor-1', eventType: 'PUT', free });
              controller.close();
            },
          }),
        );

        mockState.eventStreamForUser.mockReturnValue({ path, live, subscribe });

        const stream = await HomeserverService.subscribeUserEventStreamForPath({
          userZ32: 'user-pubky',
          cursor: 'cursor-0',
          pathPrefix: '/pub/pubky.app/mutes/',
        });
        const reader = stream.getReader();

        const result = await reader.read();

        expect(path).toHaveBeenCalledWith('/pub/pubky.app/mutes/');
        expect(live).toHaveBeenCalled();
        expect(subscribe).toHaveBeenCalled();
        expect(result.value).toEqual({ cursor: 'cursor-1', eventType: 'PUT' });
        expect(result.value).not.toHaveProperty('free');
        expect(free).toHaveBeenCalledTimes(1);
      });

      it('maps SDK connect failures to a Server AppError tagged with the subscribe operation and drops it from Sentry', async () => {
        const path = vi.fn().mockReturnThis();
        const live = vi.fn().mockReturnThis();
        const subscribe = vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('HTTP transport error: error sending request'), { name: 'RequestError' }),
          );
        mockState.eventStreamForUser.mockReturnValue({ path, live, subscribe });

        // beforeEach resets modules, so the service's AppError class is a different instance
        // from this file's static import: assert structurally, like the rest of this file.
        const error = (await HomeserverService.subscribeUserEventStreamForPath({
          userZ32: 'user-pubky',
          cursor: null,
          pathPrefix: '/pub/pubky.app/mutes/',
        }).catch((caught: unknown) => caught)) as AppError;

        expect(error).toMatchObject({
          service: ErrorService.Homeserver,
          operation: HOMESERVER_EVENT_STREAM_SUBSCRIBE_OPERATION,
          category: ErrorCategory.Server,
          code: ServerErrorCode.INTERNAL_ERROR,
        });
        expect(shouldDropAppErrorFromSentry(error)).toBe(true);
      });

      it('keeps SDK authentication failures on subscribe reportable', async () => {
        const path = vi.fn().mockReturnThis();
        const live = vi.fn().mockReturnThis();
        const subscribe = vi
          .fn()
          .mockRejectedValue(Object.assign(new Error('session expired'), { name: 'AuthenticationError' }));
        mockState.eventStreamForUser.mockReturnValue({ path, live, subscribe });

        const error = (await HomeserverService.subscribeUserEventStreamForPath({
          userZ32: 'user-pubky',
          cursor: null,
          pathPrefix: '/pub/pubky.app/mutes/',
        }).catch((caught: unknown) => caught)) as AppError;

        expect(error).toMatchObject({
          service: ErrorService.Homeserver,
          operation: HOMESERVER_EVENT_STREAM_SUBSCRIBE_OPERATION,
          category: ErrorCategory.Auth,
        });
        expect(shouldDropAppErrorFromSentry(error)).toBe(false);
      });

      it('drops SDK PKARR resolution failures on subscribe from Sentry like other connect failures', async () => {
        // The subscribe resolves the user's homeserver from PKARR first; a relay failure there
        // rejects with PkarrError (Network), and the coordinator reconnects with backoff by design.
        const path = vi.fn().mockReturnThis();
        const live = vi.fn().mockReturnThis();
        const subscribe = vi.fn().mockRejectedValue({ name: 'PkarrError', message: 'relay unreachable' });
        mockState.eventStreamForUser.mockReturnValue({ path, live, subscribe });

        const error = (await HomeserverService.subscribeUserEventStreamForPath({
          userZ32: 'user-pubky',
          cursor: null,
          pathPrefix: '/pub/pubky.app/mutes/',
        }).catch((caught: unknown) => caught)) as AppError;

        expect(error).toMatchObject({
          service: ErrorService.Homeserver,
          operation: HOMESERVER_EVENT_STREAM_SUBSCRIBE_OPERATION,
          category: ErrorCategory.Network,
          code: NetworkErrorCode.CONNECTION_FAILED,
        });
        expect(shouldDropAppErrorFromSentry(error)).toBe(true);
      });
    });

    describe('URL resolution', () => {
      it('should use session storage paths for pubky URLs', async () => {
        mockState.currentSession = createMockSession();
        mockState.sessionStorageGet.mockResolvedValue(new Response('{}', { status: 200 }));

        await HomeserverService.request({ method: HttpMethod.GET, url: 'pubky://user/pub/data.json' });

        expect(mockState.sessionStorageGet).toHaveBeenCalledWith('/pub/data.json');
      });
    });
  });
});
