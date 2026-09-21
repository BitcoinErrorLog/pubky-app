export type CapturedAuthIdentity = {
  pubky: string | null;
  hadIdentity: boolean;
};

export type AuthIdentitySnapshot = {
  session?: unknown;
  sessionExport?: unknown;
  currentUserPubky?: unknown;
};

export function nonEmptyPubky(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function identityPresent(live: AuthIdentitySnapshot, persistedIdentityPresent: boolean): boolean {
  return Boolean(
    live.session || live.sessionExport || nonEmptyPubky(live.currentUserPubky) || persistedIdentityPresent,
  );
}

/**
 * Snapshot of the identity that currently owns origin-scoped Dexie (`franky`).
 * Capture this *before* awaiting the auth-finalization lock so a concurrent
 * sign-in can be detected by re-reading inside the lock.
 */
export function captureAuthIdentityFromStore(
  live: AuthIdentitySnapshot,
  persistedIdentityPresent: boolean,
): CapturedAuthIdentity {
  const pubky = nonEmptyPubky(live.currentUserPubky);
  return {
    pubky,
    hadIdentity: identityPresent(live, persistedIdentityPresent),
  };
}

/**
 * Destructive Dexie/store cleanup must no-op when a *different* identity now
 * owns local state. Anonymous captures skip if any identity appeared;
 * known-pubky captures skip only on a different live pubky (or a live pubky
 * when the capture had identity but no known pubky).
 */
export function shouldSkipDestructiveCleanup(
  captured: CapturedAuthIdentity,
  live: AuthIdentitySnapshot,
  persistedIdentityPresent: boolean,
): boolean {
  const currentPubky = nonEmptyPubky(live.currentUserPubky);
  if (!captured.hadIdentity) {
    return identityPresent(live, persistedIdentityPresent);
  }
  if (currentPubky && captured.pubky && currentPubky !== captured.pubky) {
    return true;
  }
  if (currentPubky && !captured.pubky) {
    return true;
  }
  return false;
}

/**
 * Persist of `newPubky` must not overwrite a third identity that signed in
 * after this flow captured local state. Replacing the captured pubky, or
 * writing into an empty store, is allowed.
 */
export function shouldAbortIdentityPersist(
  captured: CapturedAuthIdentity | null,
  newPubky: string,
  currentPubky: string | null,
): boolean {
  if (!currentPubky) return false;
  if (currentPubky === newPubky) return false;
  if (captured?.pubky && currentPubky === captured.pubky) return false;
  return true;
}
