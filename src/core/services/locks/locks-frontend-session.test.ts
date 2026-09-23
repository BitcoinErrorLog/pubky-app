import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocksGatewayService } from './locks';
import {
  LOCKS_FRONTEND_SESSION_STORAGE_KEY,
  locksCreatorMatchesShopPubky,
  LocksFrontendSessionStore,
} from './locks-frontend-session';

const PUBKY = 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco';
const OTHER = 'ybndrfg8ejkmcpqxot1uwisza345h769ybndrfg8ejkmcpqxot1u';
const RECORD = {
  token: 'locks-frontend-session-token',
  creator: `pubky${PUBKY}`,
  pubky: PUBKY,
};

afterEach(() => {
  LocksFrontendSessionStore.clear();
  vi.restoreAllMocks();
});

describe('LocksFrontendSessionStore', () => {
  it('restores a saved session for the matching Shop account and drops a mismatched one', () => {
    LocksFrontendSessionStore.save(RECORD);

    expect(LocksFrontendSessionStore.restore(PUBKY)).toEqual(RECORD);
    expect(LocksFrontendSessionStore.restore(OTHER)).toBeNull();
    expect(window.localStorage.getItem(LOCKS_FRONTEND_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('drops a malformed blob instead of treating it as connected', () => {
    window.localStorage.setItem(LOCKS_FRONTEND_SESSION_STORAGE_KEY, '{"token":"x"}');
    expect(LocksFrontendSessionStore.restore(PUBKY)).toBeNull();
    expect(window.localStorage.getItem(LOCKS_FRONTEND_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('refuses to persist a record whose pubky is not a Shop identity', () => {
    LocksFrontendSessionStore.save({ ...RECORD, pubky: 'not-a-pubky' });
    expect(window.localStorage.getItem(LOCKS_FRONTEND_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('clear removes the stored bearer', () => {
    LocksFrontendSessionStore.save(RECORD);
    LocksFrontendSessionStore.clear();
    expect(LocksFrontendSessionStore.restore(PUBKY)).toBeNull();
  });

  it('sign-out teardown wipes the stored bearer', async () => {
    LocksFrontendSessionStore.save(RECORD);
    const { CommerceApplication } = await import('@/application/commerce/commerce');
    CommerceApplication.clearMarketplaceSession();
    expect(window.localStorage.getItem(LOCKS_FRONTEND_SESSION_STORAGE_KEY)).toBeNull();
    expect(LocksFrontendSessionStore.restore(PUBKY)).toBeNull();
  });

  it('refuses to persist a Lock Server creator that is not the Shop pubky', () => {
    LocksFrontendSessionStore.save({ ...RECORD, creator: `pubky${OTHER}` });
    expect(window.localStorage.getItem(LOCKS_FRONTEND_SESSION_STORAGE_KEY)).toBeNull();
    expect(locksCreatorMatchesShopPubky(`pubky${OTHER}`, PUBKY)).toBe(false);
  });

  it('clears a stale blob whose creator is not the signed-in Shop pubky', () => {
    window.localStorage.setItem(
      LOCKS_FRONTEND_SESSION_STORAGE_KEY,
      JSON.stringify({ ...RECORD, creator: `pubky${OTHER}` }),
    );
    expect(LocksFrontendSessionStore.restore(PUBKY)).toBeNull();
    expect(window.localStorage.getItem(LOCKS_FRONTEND_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('persists a matching creator and drops a foreign one at the application boundary', async () => {
    const { CommerceApplication } = await import('@/application/commerce/commerce');
    const create = vi.spyOn(LocksGatewayService, 'createFrontendSession');
    create.mockResolvedValueOnce({
      session_token: 'locks-frontend-session-token',
      creator: `pubky${PUBKY}`,
    });
    await CommerceApplication.createLocksFrontendSession('code', 'state', PUBKY);
    expect(LocksFrontendSessionStore.restore(PUBKY)).toEqual(RECORD);

    create.mockResolvedValueOnce({
      session_token: 'foreign-token',
      creator: `pubky${OTHER}`,
    });
    await CommerceApplication.createLocksFrontendSession('code', 'state', PUBKY);
    expect(window.localStorage.getItem(LOCKS_FRONTEND_SESSION_STORAGE_KEY)).toBeNull();
    create.mockRestore();
  });
});
