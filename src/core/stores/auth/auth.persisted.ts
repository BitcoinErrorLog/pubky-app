import { createJSONStorage } from 'zustand/middleware';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';

type PersistedAuthState = {
  currentUserPubky?: unknown;
  sessionExport?: unknown;
};

export type PersistedAuthIdentity = {
  pubky: string | null;
  present: boolean;
};

const EMPTY_PERSISTED_AUTH_IDENTITY: PersistedAuthIdentity = { pubky: null, present: false };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Parse a zustand persist JSON blob (`{ state, version }`) for the identity
 * that last wrote `AUTH_PERSIST_KEY`. Used both for lock-time re-reads and
 * for the persist `setItem` owner fence.
 */
export function parsePersistedAuthIdentityFromRaw(raw: string | null | undefined): PersistedAuthIdentity {
  if (!raw) return EMPTY_PERSISTED_AUTH_IDENTITY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_PERSISTED_AUTH_IDENTITY;
    const state = (parsed as { state?: unknown }).state;
    if (!state || typeof state !== 'object') return EMPTY_PERSISTED_AUTH_IDENTITY;

    const authState = state as PersistedAuthState;
    const pubky = isNonEmptyString(authState.currentUserPubky) ? authState.currentUserPubky : null;
    return {
      pubky,
      present: isNonEmptyString(authState.sessionExport) || pubky !== null,
    };
  } catch {
    return EMPTY_PERSISTED_AUTH_IDENTITY;
  }
}

/**
 * Cross-tab source of truth for who last wrote `AUTH_PERSIST_KEY`.
 * Zustand persist does not sync across tabs; the live store in this tab can
 * still show A after Tab B's `init()` overwrote the blob with B.
 * Read this fresh inside the auth-finalization lock.
 */
export function readPersistedAuthIdentity(): PersistedAuthIdentity {
  try {
    return parsePersistedAuthIdentityFromRaw(globalThis.localStorage?.getItem(AUTH_PERSIST_KEY));
  } catch {
    return EMPTY_PERSISTED_AUTH_IDENTITY;
  }
}

export function readPersistedAuthPubky(): string | null {
  return readPersistedAuthIdentity().pubky;
}

export function hasPersistedAuthIdentity(): boolean {
  return readPersistedAuthIdentity().present;
}

/** The BrowserSessionStore record id a signed-in grant session (any tab) points at, if one is persisted. */
export function readPersistedGrantSessionRecordId(): string | null {
  try {
    const raw = globalThis.localStorage?.getItem(AUTH_PERSIST_KEY);
    if (!raw) return null;
    const state = (JSON.parse(raw) as { state?: { grantSessionRecordId?: unknown } }).state;
    return isNonEmptyString(state?.grantSessionRecordId) ? state.grantSessionRecordId : null;
  } catch {
    return null;
  }
}

/**
 * Drop the persist blob so a later `init` of a different pubky is not
 * treated as a foreign clobber. Only call this inside the finalization lock
 * after `shouldAbortIdentityPersist` has allowed the replace.
 */
export function clearPersistedAuthIdentity(): void {
  try {
    globalThis.localStorage?.removeItem(AUTH_PERSIST_KEY);
  } catch {
    // Storage unavailable (private mode) — nothing could have persisted.
  }
}

/**
 * A persist write that would replace a non-empty blob pubky with a
 * different non-empty pubky is a cross-tab clobber (Tab A `setIsLoggingOut`
 * / `setIsRestoringSession` after Tab B already owns `AUTH_PERSIST_KEY`).
 * Empty/reset (incoming null) and first write (existing null) are allowed.
 * Identity switch must `clearPersistedAuthIdentity()` first.
 */
export function shouldRefuseForeignAuthPersistWrite(
  existingPubky: string | null,
  incomingPubky: string | null,
): boolean {
  return existingPubky !== null && incomingPubky !== null && existingPubky !== incomingPubky;
}

/**
 * Zustand persist storage for the auth store: `setItem` no-ops when the
 * blob already holds a different pubky. Web Locks serialize wipe/persist;
 * this fence covers incidental live-store `set()` after skip/abort.
 */
export function createOwnerGuardedAuthJSONStorage() {
  return createJSONStorage(() => {
    const storage = globalThis.localStorage;
    if (!storage) {
      throw new Error('localStorage unavailable');
    }
    return {
      getItem: (name: string) => storage.getItem(name),
      setItem: (name: string, value: string) => {
        if (
          name === AUTH_PERSIST_KEY &&
          shouldRefuseForeignAuthPersistWrite(readPersistedAuthPubky(), parsePersistedAuthIdentityFromRaw(value).pubky)
        ) {
          return;
        }
        storage.setItem(name, value);
      },
      removeItem: (name: string) => storage.removeItem(name),
    };
  });
}
