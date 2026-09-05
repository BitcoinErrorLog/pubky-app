import { create } from 'zustand';

/**
 * Phase 0 Pubchi signing seed. In-memory only — never persisted, never
 * written to a Zustand persist store, never sent through Redux DevTools.
 * Populated at secret-based sign-in / in-browser signup and cleared on
 * sign-out (`cleanupLocalState`). Ring / auth-URL sessions leave this empty.
 */
let signingSeed: Uint8Array | null = null;

export const usePubchiSigningAvailable = create<{ available: boolean }>(() => ({
  available: false,
}));

function syncAvailability(): void {
  usePubchiSigningAvailable.setState({ available: signingSeed !== null });
}

export function retainPubchiSigningSeed(keypair: { secret: () => Uint8Array }): void {
  const secret = keypair.secret();
  signingSeed = new Uint8Array(secret);
  syncAvailability();
}

export function clearPubchiSigningSeed(): void {
  signingSeed?.fill(0);
  signingSeed = null;
  syncAvailability();
}

export function hasPubchiSigningSeed(): boolean {
  return signingSeed !== null;
}

/** Returns a copy. Caller must `fill(0)` after the sign call. */
export function getPubchiSigningSeedCopy(): Uint8Array | undefined {
  if (!signingSeed) return undefined;
  return new Uint8Array(signingSeed);
}
