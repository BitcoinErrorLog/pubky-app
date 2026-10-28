import { describe, expect, it } from 'vitest';
import { mockGrantReference, mockSession } from '@/test-utils/pubky';
import { hasAccountState, selectDisplayUserPubky } from './auth.selectors';

describe('hasAccountState', () => {
  it('is true for a ready session', () => {
    expect(
      hasAccountState({ session: mockSession(), sessionReference: mockGrantReference(), restoreStatus: 'ready' }),
    ).toBe(true);
  });

  it('is true while the session is restoring', () => {
    expect(hasAccountState({ session: null, sessionReference: mockGrantReference(), restoreStatus: 'restoring' })).toBe(
      true,
    );
  });

  it('is true while a saved session is still pending restoration', () => {
    expect(hasAccountState({ session: null, sessionReference: mockGrantReference(), restoreStatus: 'idle' })).toBe(
      true,
    );
  });

  it.each(['reauth-required', 'temporary-error'] as const)(
    'is true after %s: that member can still recover',
    (restoreStatus) => {
      expect(hasAccountState({ session: null, sessionReference: null, restoreStatus })).toBe(true);
    },
  );

  it('is false for a generated pubky with no session and nothing to restore (#2955)', () => {
    expect(hasAccountState({ session: null, sessionReference: null, restoreStatus: 'idle' })).toBe(false);
  });
});

describe('selectDisplayUserPubky', () => {
  it('returns the pubky of a ready session', () => {
    expect(
      selectDisplayUserPubky({
        currentUserPubky: 'account',
        session: mockSession(),
        sessionReference: mockGrantReference(),
        restoreStatus: 'ready',
      }),
    ).toBe('account');
  });

  it('keeps the saved pubky while the session is restoring', () => {
    expect(
      selectDisplayUserPubky({
        currentUserPubky: 'account',
        session: null,
        sessionReference: mockGrantReference(),
        restoreStatus: 'restoring',
      }),
    ).toBe('account');
  });

  it('keeps the saved pubky while a saved session is still pending restoration', () => {
    expect(
      selectDisplayUserPubky({
        currentUserPubky: 'account',
        session: null,
        sessionReference: mockGrantReference(),
        restoreStatus: 'idle',
      }),
    ).toBe('account');
  });

  it.each(['reauth-required', 'temporary-error'] as const)('hides the saved pubky after %s', (restoreStatus) => {
    expect(
      selectDisplayUserPubky({ currentUserPubky: 'account', session: null, sessionReference: null, restoreStatus }),
    ).toBeNull();
  });

  it('hides a generated pubky that has no session and nothing to restore (#2882)', () => {
    expect(
      selectDisplayUserPubky({
        currentUserPubky: 'generated-key',
        session: null,
        sessionReference: null,
        restoreStatus: 'idle',
      }),
    ).toBeNull();
  });

  it('returns null for a guest without a pubky', () => {
    expect(
      selectDisplayUserPubky({ currentUserPubky: null, session: null, sessionReference: null, restoreStatus: 'idle' }),
    ).toBeNull();
  });
});
