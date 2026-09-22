import { DB_NAME } from '@/config/database';
import { db } from '@/database/franky/franky';
import { deleteWrappingKeyStore } from '@/libs/crypto/messaging-keyring';

export const PUBLIC_CACHE_TABLES: ReadonlySet<string> = new Set([
  'user_counts',
  'user_details',
  'user_ttl',
  'post_counts',
  'post_details',
  'post_relationships',
  'post_ttl',
  'file_details',
  'tag_streams',
  'commerce_shops',
  'commerce_listings',
  'commerce_catalog_entries',
  'commerce_listing_projections',
]);

/**
 * Device-local rows keyed by `owner_id`. Identity switch and sign-out must
 * not wipe another identity's book — ADR-0019 keeps addresses off the
 * homeserver, so they live here across sessions on this device.
 */
export const IDENTITY_SCOPED_DEVICE_TABLES: ReadonlySet<string> = new Set(['commerce_delivery_addresses']);

function tablesClearedOnIdentitySwitch(includePublicCache: boolean) {
  return db.tables.filter((table) => {
    if (IDENTITY_SCOPED_DEVICE_TABLES.has(table.name)) return false;
    if (!includePublicCache && PUBLIC_CACHE_TABLES.has(table.name)) return false;
    return true;
  });
}

export async function clearDatabase(): Promise<void> {
  if (!db.isOpen()) {
    await db.open();
  }

  await Promise.all(tablesClearedOnIdentitySwitch(true).map((table) => table.clear()));
  // The messaging wrapping key lives outside the Dexie tables; wipe it too so
  // sign-out/account switch leaves no key material behind. (Its ciphertexts
  // were just cleared, so a deletion failure would be harmless — the helper
  // is best-effort by design.)
  await deleteWrappingKeyStore();
}

export async function clearPrivateData(): Promise<void> {
  if (!db.isOpen()) {
    await db.open();
  }

  await Promise.all(tablesClearedOnIdentitySwitch(false).map((table) => table.clear()));
  await deleteWrappingKeyStore();
}

export async function resetDatabase(): Promise<void> {
  const { indexedDB } = await import('fake-indexeddb');

  db.close();
  indexedDB.deleteDatabase(DB_NAME);
  await db.open();
}
