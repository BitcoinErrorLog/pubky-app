import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { ZustandGet } from '../stores.types';
import { AuthState, AuthStore } from './auth.types';

/**
 * Pure snapshot check: the user is authenticated when the snapshot holds a session.
 *
 * Use this — not `selectIsAuthenticated()` — when comparing `state` and `prevState`
 * inside a store subscriber. The selectors below close over the store's `get()`, so
 * `prevState.selectIsAuthenticated()` reads the *current* store and can never differ
 * from `state.selectIsAuthenticated()`; a transition compared that way is never seen.
 */
export const isAuthenticatedState = (state: Pick<AuthState, 'session'>): boolean => state.session !== null;

/**
 * Preserve account chrome during restoration; show guest UI once restoration has failed. Not an action guard.
 *
 * A pubky with no session and no session reference to restore is a guest too: the onboarding key step
 * stores a generated pubky before sign-up, and `useAuthStatus` already treats that visitor as a guest.
 */
export const selectDisplayUserPubky = (
  state: Pick<AuthState, 'currentUserPubky' | 'session' | 'sessionReference' | 'restoreStatus'>,
) => {
  if (state.restoreStatus === 'reauth-required' || state.restoreStatus === 'temporary-error') return null;
  if (state.restoreStatus === 'idle' && state.session === null && state.sessionReference === null) return null;
  return state.currentUserPubky;
};

// Selectors - State access functions with validation
export const createAuthSelectors = (get: ZustandGet<AuthStore>) => ({
  // call: useAuthStore((state) => state.selectCurrentUserPubky())
  selectCurrentUserPubky: () => {
    const pubky = get().currentUserPubky;
    if (pubky === null) {
      throw Err.auth(
        AuthErrorCode.UNAUTHORIZED,
        'Current user pubky is not available. User may not be authenticated.',
        {
          service: ErrorService.Local,
          operation: 'selectCurrentUserPubky',
        },
      );
    }
    return pubky;
  },

  /**
   * User is authenticated when they have a valid session
   */
  selectIsAuthenticated: () => isAuthenticatedState(get()),

  /**
   * Selects the current session
   */
  selectSession: () => get().session,
});
