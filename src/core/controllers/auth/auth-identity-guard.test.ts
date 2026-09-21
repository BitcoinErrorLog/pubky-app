import { describe, expect, it } from 'vitest';
import {
  captureAuthIdentityFromStore,
  shouldAbortIdentityPersist,
  shouldSkipDestructiveCleanup,
} from '@/controllers/auth/auth-identity-guard';

const ACCOUNT_A = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';
const ACCOUNT_B = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

describe('auth identity guard', () => {
  it('captures a known live pubky as hadIdentity', () => {
    expect(captureAuthIdentityFromStore({ currentUserPubky: ACCOUNT_A, sessionExport: 'export-a' }, false)).toEqual({
      pubky: ACCOUNT_A,
      hadIdentity: true,
    });
  });

  it('treats an empty store as anonymous even if a stale persist flag is false', () => {
    expect(captureAuthIdentityFromStore({ currentUserPubky: null, session: null, sessionExport: null }, false)).toEqual(
      {
        pubky: null,
        hadIdentity: false,
      },
    );
  });

  it('skips anonymous cleanup when a concurrent sign-in established any identity', () => {
    const captured = captureAuthIdentityFromStore({ currentUserPubky: null }, false);
    expect(shouldSkipDestructiveCleanup(captured, { currentUserPubky: ACCOUNT_B, sessionExport: 'b' }, false)).toBe(
      true,
    );
  });

  it('does not skip anonymous cleanup when the store is still empty', () => {
    const captured = captureAuthIdentityFromStore({ currentUserPubky: null }, false);
    expect(
      shouldSkipDestructiveCleanup(captured, { currentUserPubky: null, session: null, sessionExport: null }, false),
    ).toBe(false);
  });

  it('skips identityAtCapture=true cleanup when a different account now owns the store', () => {
    const captured = captureAuthIdentityFromStore({ currentUserPubky: ACCOUNT_A, sessionExport: 'a' }, false);
    expect(shouldSkipDestructiveCleanup(captured, { currentUserPubky: ACCOUNT_B, sessionExport: 'b' }, false)).toBe(
      true,
    );
  });

  it('still wipes leftover state for the captured account when restore fails alone', () => {
    const captured = captureAuthIdentityFromStore({ currentUserPubky: ACCOUNT_A, sessionExport: 'a' }, false);
    expect(shouldSkipDestructiveCleanup(captured, { currentUserPubky: ACCOUNT_A, sessionExport: 'a' }, false)).toBe(
      false,
    );
    expect(
      shouldSkipDestructiveCleanup(captured, { currentUserPubky: null, session: null, sessionExport: null }, false),
    ).toBe(false);
  });

  it('aborts persist when a third identity owns local state', () => {
    const captured = captureAuthIdentityFromStore({ currentUserPubky: ACCOUNT_A }, false);
    expect(shouldAbortIdentityPersist(captured, 'new-account', ACCOUNT_B)).toBe(true);
  });

  it('allows persist that replaces the captured identity or writes into an empty store', () => {
    const captured = captureAuthIdentityFromStore({ currentUserPubky: ACCOUNT_A }, false);
    expect(shouldAbortIdentityPersist(captured, ACCOUNT_B, ACCOUNT_A)).toBe(false);
    expect(shouldAbortIdentityPersist(captured, ACCOUNT_B, null)).toBe(false);
    expect(shouldAbortIdentityPersist(captured, ACCOUNT_B, ACCOUNT_B)).toBe(false);
  });
});
