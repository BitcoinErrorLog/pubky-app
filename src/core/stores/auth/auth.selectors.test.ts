import { describe, expect, it } from 'vitest';
import { mockGrantReference, mockSession } from '@/test-utils/pubky';
import { selectDisplayUserPubky } from './auth.selectors';

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
