import { afterEach, describe, expect, it } from 'vitest';
import { LOCKS_FRONTEND_SESSION_STORAGE_KEY, LocksFrontendSessionStore } from './locks-frontend-session';

const PUBKY = 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco';
const OTHER = 'ybndrfg8ejkmcpqxot1uwisza345h769ybndrfg8ejkmcpqxot1u';
const RECORD = {
  token: 'locks-frontend-session-token',
  creator: `pubky${PUBKY}`,
  pubky: PUBKY,
};

afterEach(() => {
  LocksFrontendSessionStore.clear();
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
});
