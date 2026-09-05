/**
 * Custody for the messaging at-rest wrapping key.
 *
 * A single AES-GCM-256 CryptoKey, generated on first use as
 * NON-EXTRACTABLE (the raw key bytes can never leave WebCrypto into JS),
 * persisted in its own tiny IndexedDB database — separate from the main
 * Dexie database so this module stays free of database-layer cycles
 * (the main database's migrations depend on this key). Same design as the
 * sibling product's proven WebKeyStore, adapted to this repo's layering:
 * pure AEAD helpers live in `./secret-wrapping`; services compose both.
 *
 * FAIL CLOSED, always: if WebCrypto or IndexedDB is unavailable, every
 * operation throws an `Err.database` AppError — there is NO plaintext
 * fallback. Losing this key (profile wipe without the database, targeted
 * deletion) makes every wrapped row unrecoverable; the service layer
 * treats such rows as lost and the user re-enables messaging.
 */

import { DB_NAME } from '@/config/database';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';

const KEYRING_DB_NAME = `${DB_NAME}-messaging-keyring`;
const KEYRING_DB_VERSION = 1;
const KEYRING_STORE_NAME = 'wrapping-key';
const WRAPPING_KEY_RECORD_ID = 'wrapping-key';

let cachedKey: CryptoKey | null = null;
let keyringDbPromise: Promise<IDBDatabase> | null = null;

/**
 * Fail-closed precondition for every custody operation: AES-GCM wrapping
 * needs `crypto.subtle`, IVs need a CSPRNG, and persistence needs IDB.
 * Throws an AppError (never returns a degraded mode) when any is missing.
 */
function assertMessagingCryptoAvailable(operation: string): void {
  const crypto = globalThis.crypto;
  if (!crypto || typeof crypto.subtle !== 'object' || crypto.subtle === null) {
    throw Err.database(
      DatabaseErrorCode.INIT_FAILED,
      'WebCrypto (crypto.subtle) is unavailable; messaging key custody cannot operate and never falls back to plaintext.',
      { service: ErrorService.Local, operation },
    );
  }
  if (typeof crypto.getRandomValues !== 'function') {
    throw Err.database(
      DatabaseErrorCode.INIT_FAILED,
      'crypto.getRandomValues is unavailable; messaging key custody cannot operate without a CSPRNG.',
      { service: ErrorService.Local, operation },
    );
  }
  if (typeof indexedDB === 'undefined') {
    throw Err.database(
      DatabaseErrorCode.INIT_FAILED,
      'IndexedDB is unavailable; the messaging wrapping key has nowhere to persist.',
      { service: ErrorService.Local, operation },
    );
  }
}

function openKeyringDb(): Promise<IDBDatabase> {
  keyringDbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(KEYRING_DB_NAME, KEYRING_DB_VERSION);
    request.onerror = () => {
      // A failed open must stay retryable on the next call.
      keyringDbPromise = null;
      reject(request.error ?? new Error('Failed to open the messaging keyring database'));
    };
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(KEYRING_STORE_NAME)) {
        request.result.createObjectStore(KEYRING_STORE_NAME);
      }
    };
  });
  return keyringDbPromise;
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Messaging keyring request failed'));
  });
}

function isUsableWrappingKey(candidate: unknown): candidate is CryptoKey {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    (candidate as CryptoKey).type === 'secret' &&
    (candidate as CryptoKey).algorithm?.name === 'AES-GCM' &&
    Array.isArray((candidate as CryptoKey).usages) &&
    (candidate as CryptoKey).usages.includes('encrypt') &&
    (candidate as CryptoKey).usages.includes('decrypt')
  );
}

/**
 * Loads the persisted wrapping key, generating and persisting a fresh
 * NON-EXTRACTABLE AES-GCM-256 key on first use. The resolved key is cached
 * in memory for the session (one IDB read per load, zero per wrap).
 *
 * Throws (fail closed) when WebCrypto/IDB is unavailable or persistence
 * fails — callers must never see a "keyless" mode.
 */
export async function getOrCreateWrappingKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  assertMessagingCryptoAvailable('getOrCreateWrappingKey');
  try {
    const db = await openKeyringDb();
    const existing = await idbRequest(
      db.transaction(KEYRING_STORE_NAME, 'readonly').objectStore(KEYRING_STORE_NAME).get(WRAPPING_KEY_RECORD_ID),
    );
    if (isUsableWrappingKey(existing)) {
      cachedKey = existing;
      return existing;
    }
    if (existing !== undefined) {
      // A record that is not a usable AES-GCM key can never unwrap anything;
      // replace it rather than failing every row read forever.
      Logger.warn('Messaging keyring held an unusable record; replacing it with a fresh wrapping key');
    }
    const generated = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    await idbRequest(
      db.transaction(KEYRING_STORE_NAME, 'readwrite').objectStore(KEYRING_STORE_NAME).put(generated, WRAPPING_KEY_RECORD_ID),
    );
    cachedKey = generated;
    return generated;
  } catch (error) {
    throw Err.database(
      DatabaseErrorCode.INIT_FAILED,
      'Failed to load or create the messaging wrapping key; refusing to operate without it.',
      { service: ErrorService.Local, operation: 'getOrCreateWrappingKey', cause: error },
    );
  }
}

/**
 * Deletes the wrapping key and its database. Best-effort: called from
 * `clearDatabase()` on sign-out/account switch, where every wrapped row is
 * being wiped anyway — a key that outlives its ciphertexts protects nothing,
 * so a deletion failure is logged, never fatal.
 */
export async function deleteWrappingKeyStore(): Promise<void> {
  cachedKey = null;
  if (keyringDbPromise) {
    try {
      (await keyringDbPromise).close();
    } catch {
      // Closing is hygiene; deletion below is the operation that matters.
    }
    keyringDbPromise = null;
  }
  if (typeof indexedDB === 'undefined') return;
  try {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(KEYRING_DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Failed to delete the messaging keyring database'));
      request.onblocked = () => resolve();
    });
  } catch (error) {
    Logger.warn('Could not delete the messaging keyring database', { error });
  }
}

/**
 * Test seam: drops the in-memory cache AND the persisted key, simulating a
 * lost wrapping key (profile wipe without the main database). Never used in
 * production — sign-out goes through {@link deleteWrappingKeyStore}.
 */
export async function resetMessagingKeyringForTests(): Promise<void> {
  await deleteWrappingKeyStore();
}

/**
 * Test seam: drops ONLY the in-memory cache, simulating a browser reload
 * (the persisted key survives and must be reloaded). Never used in production.
 */
export function dropCachedWrappingKeyForTests(): void {
  cachedKey = null;
}
