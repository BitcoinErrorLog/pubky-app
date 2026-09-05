import Dexie, { type Table } from 'dexie';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import { type PubchiBindingRecord, pubchiBindingTableSchema } from '@/models/pubchi/binding.schema';

/**
 * Isolated IndexedDB for Phase 0 Pubchi bindings. Separate from franky so the
 * flagged spike does not bump `NEXT_PUBLIC_DB_VERSION` or recreate user data.
 */
class PubchiDatabase extends Dexie {
  bindings!: Table<PubchiBindingRecord>;

  constructor() {
    super('pubchi');
    this.version(1).stores({
      bindings: pubchiBindingTableSchema,
    });
  }
}

let instance: PubchiDatabase | null = null;

export function getPubchiDatabase(): PubchiDatabase {
  if (!isPubchiEnabled()) {
    throw Err.database(DatabaseErrorCode.INIT_FAILED, 'Pubchi local database is closed while the flag is off', {
      service: ErrorService.Pubchi,
      operation: 'getPubchiDatabase',
    });
  }
  if (!instance) {
    instance = new PubchiDatabase();
  }
  return instance;
}

export function resetPubchiDatabaseForTests(): void {
  instance = null;
}
