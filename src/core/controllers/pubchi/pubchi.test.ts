import type { Session } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiApplication } from '@/application/pubchi/pubchi';
import { AuthController } from '@/controllers/auth/auth';
import { AuthErrorCode } from '@/libs/error/error.codes';
import * as deviceKey from '@/libs/pubchi/device-key';
import {
  PENDING_DELEGATION_DELETES_KEY,
  readPendingDelegationDeletes,
} from '@/libs/pubchi/pending-delegation-deletes';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthStore } from '@/stores/auth/auth.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { PubchiController } from './pubchi';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;
const BOT = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const OTHER = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Pubky;

const authState = {
  setSession: vi.fn(),
  session: undefined as Session | undefined,
};

function setPubchiEnv(enabled?: string, apiUrl?: string) {
  if (enabled === undefined) delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
  else process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = enabled;
  if (apiUrl === undefined) delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl];
  else process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = apiUrl;
  resetRuntimeConfigForTests();
}

function sessionFor(pubky: string, capabilities: string[] = []) {
  return asOpaque<Session>({
    info: { publicKey: { z32: () => pubky }, capabilities },
  });
}

describe('PubchiController', () => {
  beforeEach(() => {
    authState.setSession.mockReset().mockImplementation((session: Session | null) => {
      authState.session = session ?? undefined;
    });
    authState.session = sessionFor(OWNER);
    vi.spyOn(PubchiApplication, 'unpublishKnownDelegations').mockResolvedValue({ failed: [] });
    vi.spyOn(useAuthStore, 'getState').mockReturnValue(
      asOpaque<AuthStore>({
        selectCurrentUserPubky: () => OWNER,
        currentUserPubky: OWNER,
        session: authState.session,
        setSession: authState.setSession,
      }),
    );
  });

  afterEach(() => {
    setPubchiEnv();
    localStorage.removeItem(PENDING_DELEGATION_DELETES_KEY);
    vi.restoreAllMocks();
  });

  it('does not call the application or network when the flag is off', async () => {
    setPubchiEnv('false');
    const querySpy = vi.spyOn(PubchiApplication, 'query');
    const createSpy = vi.spyOn(PubchiApplication, 'commitCreateBinding');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(PubchiController.getActiveBinding()).resolves.toBeUndefined();
    await expect(PubchiController.commitCreateBinding({ bot: BOT })).rejects.toThrow('PUBCHI_DISABLED');
    await expect(PubchiController.commitDeleteBinding()).rejects.toThrow('PUBCHI_DISABLED');
    await expect(
      PubchiController.fetchPubchiQuery({
        question: 'who tagged me?',
        purpose: 'who-tagged-me',
      }),
    ).rejects.toThrow('PUBCHI_DISABLED');

    expect(querySpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchPubchiQuery delegates to the application when the panel is enabled', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const success = {
      kind: 'query' as const,
      result: { schema: 'pubchi-query-result' },
    };
    const querySpy = vi.spyOn(PubchiApplication, 'query').mockResolvedValue(success as never);
    await expect(
      PubchiController.fetchPubchiQuery({ question: 'who tagged me?', purpose: 'who-tagged-me' }),
    ).resolves.toEqual(success);
    expect(querySpy).toHaveBeenCalledWith({
      owner: OWNER,
      question: 'who tagged me?',
      purpose: 'who-tagged-me',
    });
  });

  it('commitCreateBinding rejects an invalid bot pubky before writing', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const createSpy = vi.spyOn(PubchiApplication, 'commitCreateBinding');
    await expect(PubchiController.commitCreateBinding({ bot: 'not-a-pubky' })).rejects.toThrow('INVALID_PUBKY');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('does not DELETE a UI-supplied path-injection signer', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    await expect(PubchiController.revokeDevice('../bots/x')).rejects.toThrow('INVALID_PUBKY');
    await expect(PubchiController.revokeDevice('../../pubky.app/profile')).rejects.toThrow('INVALID_PUBKY');
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('deletes a Dexie-planted invalid signer that cannot be revoked remotely', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const planted = '../../pubky.app/profile';
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${planted}`,
        owner: OWNER,
        signer: planted,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2_000_000_000,
      },
    ]);
    const deleteSpy = vi.spyOn(deviceKey, 'deleteDeviceKey').mockResolvedValue(undefined);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await PubchiController.revokeAllDevices();

    expect(requestSpy).not.toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledWith(OWNER, planted);
  });

  it('returns the auth-url triple so the caller can cancel and await approval', async () => {
    const cancel = vi.fn();
    const awaitApproval = Promise.resolve(sessionFor(OWNER));
    vi.spyOn(HomeserverService, 'generateAuthUrl').mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval,
      cancelAuthFlow: cancel,
    });
    await expect(PubchiController.getCapabilityApprovalUrl()).resolves.toEqual({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval,
      cancelAuthFlow: cancel,
    });
  });

  it('adopts broader Pubchi coverage over a non-covering session', async () => {
    authState.session = sessionFor(OWNER, ['/pub/pubky.app/:rw']);
    vi.mocked(useAuthStore.getState).mockReturnValue(
      asOpaque<AuthStore>({
        selectCurrentUserPubky: () => OWNER,
        currentUserPubky: OWNER,
        session: authState.session,
        setSession: authState.setSession,
      }),
    );
    const session = sessionFor(OWNER, ['/pub/pubky.app/:rw', '/pub/pubchi.app/:rw']);
    const bootstrapSpy = vi.spyOn(AuthController, 'initializeAuthenticatedSession');
    await PubchiController.adoptCapabilityApproval(session);
    expect(authState.setSession).toHaveBeenCalledWith(session);
    expect(bootstrapSpy).not.toHaveBeenCalled();
  });

  it('keeps the auth store aligned with the narrower approved session already in the cookie jar', async () => {
    authState.session = sessionFor(OWNER, ['/:rw']);
    vi.mocked(useAuthStore.getState).mockReturnValue(
      asOpaque<AuthStore>({
        selectCurrentUserPubky: () => OWNER,
        currentUserPubky: OWNER,
        session: authState.session,
        setSession: authState.setSession,
      }),
    );
    const session = sessionFor(OWNER, ['/pub/pubky.app/:rw']);
    const logoutSpy = vi.spyOn(HomeserverService, 'logout').mockRejectedValue(new Error('logout failed'));

    await PubchiController.adoptCapabilityApproval(session);

    expect(logoutSpy).not.toHaveBeenCalled();
    expect(authState.setSession).toHaveBeenCalledWith(session);
    expect(authState.session).toBe(session);
    expect(PubchiApplication.unpublishKnownDelegations).not.toHaveBeenCalled();
  });

  it('preserves pending delegation deletes when adopting a narrower approved session', async () => {
    const pending = [{ owner: OWNER, signer: OWNER }];
    localStorage.setItem(PENDING_DELEGATION_DELETES_KEY, JSON.stringify(pending));
    authState.session = sessionFor(OWNER, ['/:rw']);
    vi.mocked(useAuthStore.getState).mockReturnValue(
      asOpaque<AuthStore>({
        selectCurrentUserPubky: () => OWNER,
        currentUserPubky: OWNER,
        session: authState.session,
        setSession: authState.setSession,
      }),
    );
    const session = sessionFor(OWNER, ['/pub/pubky.app/:rw']);

    await PubchiController.adoptCapabilityApproval(session);

    expect(readPendingDelegationDeletes()).toEqual(pending);
    expect(PubchiApplication.unpublishKnownDelegations).not.toHaveBeenCalled();
  });

  it('adopts equal root coverage', async () => {
    authState.session = sessionFor(OWNER, ['/:rw']);
    vi.mocked(useAuthStore.getState).mockReturnValue(
      asOpaque<AuthStore>({
        selectCurrentUserPubky: () => OWNER,
        currentUserPubky: OWNER,
        session: authState.session,
        setSession: authState.setSession,
      }),
    );
    const session = sessionFor(OWNER, ['/:rw']);

    await PubchiController.adoptCapabilityApproval(session);

    expect(authState.setSession).toHaveBeenCalledWith(session);
    expect(PubchiApplication.unpublishKnownDelegations).toHaveBeenCalledWith(OWNER, {
      attemptRemote: true,
      includeLocalKeys: false,
    });
  });

  it('keeps the covering approved session when the pending delegation drain rejects', async () => {
    authState.session = sessionFor(OWNER, ['/pub/pubky.app/:rw']);
    vi.mocked(useAuthStore.getState).mockReturnValue(
      asOpaque<AuthStore>({
        selectCurrentUserPubky: () => OWNER,
        currentUserPubky: OWNER,
        session: authState.session,
        setSession: authState.setSession,
      }),
    );
    const session = sessionFor(OWNER, ['/pub/pubky.app/:rw', '/pub/pubchi.app/:rw']);
    vi.mocked(PubchiApplication.unpublishKnownDelegations).mockRejectedValue(new Error('drain failed'));

    await PubchiController.adoptCapabilityApproval(session);

    expect(authState.session).toBe(session);
    expect(PubchiApplication.unpublishKnownDelegations).toHaveBeenCalledWith(OWNER, {
      attemptRemote: true,
      includeLocalKeys: false,
    });
  });

  it('adopts equal non-covering coverage', async () => {
    authState.session = sessionFor(OWNER, ['/pub/pubky.app/:rw']);
    vi.mocked(useAuthStore.getState).mockReturnValue(
      asOpaque<AuthStore>({
        selectCurrentUserPubky: () => OWNER,
        currentUserPubky: OWNER,
        session: authState.session,
        setSession: authState.setSession,
      }),
    );
    const session = sessionFor(OWNER, ['/pub/pubky.app/:rw']);

    await PubchiController.adoptCapabilityApproval(session);

    expect(authState.setSession).toHaveBeenCalledWith(session);
  });

  it('signs out a mismatched capability-approval session and does not adopt it', async () => {
    authState.session = sessionFor(OWNER, ['/:rw']);
    vi.mocked(useAuthStore.getState).mockReturnValue(
      asOpaque<AuthStore>({
        selectCurrentUserPubky: () => OWNER,
        currentUserPubky: OWNER,
        session: authState.session,
        setSession: authState.setSession,
      }),
    );
    const session = sessionFor(OTHER, ['/pub/pubchi.app/:rw']);
    const logoutSpy = vi.spyOn(HomeserverService, 'logout').mockResolvedValue(undefined);
    await expect(PubchiController.adoptCapabilityApproval(session)).rejects.toMatchObject({
      code: AuthErrorCode.FORBIDDEN,
      message: 'PUBCHI_SESSION_IDENTITY_MISMATCH',
    });
    expect(logoutSpy).toHaveBeenCalledWith({ session });
    expect(authState.setSession).not.toHaveBeenCalled();
  });
});
