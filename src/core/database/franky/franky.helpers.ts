import { DB_NAME } from '@/config/database';
import { db } from '@/database/franky/franky';
import { deleteWrappingKeyStore } from '@/libs/crypto/messaging-keyring';

export async function clearDatabase(): Promise<void> {
  if (!db.isOpen()) {
    await db.open();
  }

  await Promise.all(db.tables.map((table) => table.clear()));
  // The messaging wrapping key lives outside the Dexie tables; wipe it too so
  // sign-out/account switch leaves no key material behind. (Its ciphertexts
  // were just cleared, so a deletion failure would be harmless — the helper
  // is best-effort by design.)
  await deleteWrappingKeyStore();
}

export async function resetDatabase(): Promise<void> {
  const { indexedDB } = await import('fake-indexeddb');

  db.close();
  indexedDB.deleteDatabase(DB_NAME);
  await db.open();
}
