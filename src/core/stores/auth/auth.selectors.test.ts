import { describe, expect, it } from 'vitest';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { mockGrantReference, mockSession } from '@/test-utils/pubky';
import { mockAuthStore } from '@/test-utils/stores';
import { createAuthSelectors, selectDisplayUserPubky } from './auth.selectors';

describe('createAuthSelectors', () => {
  it('throws an Auth/UNAUTHORIZED AppError when no user is signed in (#2958)', () => {
    const { selectCurrentUserPubky } = createAuthSelectors(() => mockAuthStore({ currentUserPubky: null }));
    expect(selectCurrentUserPubky).toThrow(
      expect.objectContaining({
        category: ErrorCategory.Auth,
        code: AuthErrorCode.UNAUTHORIZED,
        service: ErrorService.Local,
        operation: 'selectCurrentUserPubky',
      }),
    );
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
