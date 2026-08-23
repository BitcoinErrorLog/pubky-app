/**
 * Device-local index of the drop ids this account has published FROM THIS
 * BROWSER, keyed per account in localStorage.
 *
 * Why it exists (honest limitation, reported in the drops-home UI): drop
 * records live on the seller's homeserver, but the client has no controller
 * method to list the drops directory yet (`HomeserverService.listAll` exists
 * at the service layer only, and services are not callable from hooks). Until
 * a `CommerceController.listOwnDrops()` lands, this index is how the drops
 * home enumerates — it is NEVER treated as authority: every remembered id is
 * re-read from the homeserver record (`fetchDrop`) and the transaction
 * service (`getOwnDrop`) before anything renders, and ids whose record is
 * gone can be forgotten. Drops published from another browser simply do not
 * appear here; their records remain intact on the homeserver.
 */

const STORAGE_KEY_PREFIX = 'marketplace:own-drops:';

function storageKey(accountPubky: string): string {
  return `${STORAGE_KEY_PREFIX}${accountPubky}`;
}

function readRaw(accountPubky: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(accountPubky));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  } catch {
    return [];
  }
}

/** Drop ids remembered for this account, newest publish first. */
export function readOwnDropIndex(accountPubky: string): string[] {
  return readRaw(accountPubky);
}

/** Prepends a freshly published drop id (idempotent, newest first). */
export function rememberOwnDrop(accountPubky: string, dropId: string): void {
  const existing = readRaw(accountPubky).filter((id) => id !== dropId);
  try {
    window.localStorage.setItem(storageKey(accountPubky), JSON.stringify([dropId, ...existing]));
  } catch {
    // Quota/private-mode failures only lose the device-local shortcut — the
    // homeserver record and the service aggregate are unaffected.
  }
}

/** Removes an id whose homeserver record no longer exists. */
export function forgetOwnDrop(accountPubky: string, dropId: string): void {
  const remaining = readRaw(accountPubky).filter((id) => id !== dropId);
  try {
    if (remaining.length === 0) {
      window.localStorage.removeItem(storageKey(accountPubky));
    } else {
      window.localStorage.setItem(storageKey(accountPubky), JSON.stringify(remaining));
    }
  } catch {
    // Same non-fatal failure mode as rememberOwnDrop.
  }
}
