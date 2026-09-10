import Dexie, { type Table } from 'dexie';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import { type PubchiBindingRecord, pubchiBindingTableSchema } from '@/models/pubchi/binding.schema';
import { type PubchiDeviceKeyRecord, pubchiDeviceKeyTableSchema } from '@/models/pubchi/device-key.schema';
import { pubchiFeedProvenanceTableSchema } from '@/models/pubchi/feed-provenance.schema';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';

/**
 * Isolated IndexedDB for Phase 0 Pubchi bindings. Separate from franky so the
 * flagged spike does not bump `NEXT_PUBLIC_DB_VERSION` or recreate user data.
 */
class PubchiDatabase extends Dexie {
  bindings!: Table<PubchiBindingRecord>;
  deviceKeys!: Table<PubchiDeviceKeyRecord>;

  constructor() {
    super('pubchi');
    this.version(2).stores({
      bindings: pubchiBindingTableSchema,
      deviceKeys: pubchiDeviceKeyTableSchema,
    });
    this.version(3).stores({
      bindings: pubchiBindingTableSchema,
      deviceKeys: pubchiDeviceKeyTableSchema,
      feedProvenance: pubchiFeedProvenanceTableSchema,
    });
    this.version(4).stores({
      bindings: pubchiBindingTableSchema,
      deviceKeys: pubchiDeviceKeyTableSchema,
      feedProvenance: null,
    });

    let blockedRetryTimer: ReturnType<typeof setTimeout> | undefined;
    let blockedLogged = false;
    const clearBlockedState = () => {
      if (blockedRetryTimer) clearTimeout(blockedRetryTimer);
      blockedRetryTimer = undefined;
      blockedLogged = false;
      usePubchiStore.getState().setDatabaseBlocked(false);
    };
    const retryOpen = () => {
      if (this.isOpen()) {
        clearBlockedState();
        return;
      }
      void this.open().then(clearBlockedState).catch(() => {
        blockedRetryTimer = setTimeout(retryOpen, 1_000);
      });
    };
    this.on('versionchange', () => {
      this.close();
    });
    this.on('ready', clearBlockedState);
    this.on('blocked', () => {
      if (!blockedLogged) {
        blockedLogged = true;
        Logger.warn('Pubchi database upgrade is blocked by another tab');
      }
      usePubchiStore.getState().setDatabaseBlocked(true);
      if (!blockedRetryTimer) blockedRetryTimer = setTimeout(retryOpen, 1_000);
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
  usePubchiStore.getState().setDatabaseBlocked(false);
}

/**
 * Drop the isolated `pubchi` IndexedDB. Does not call `getPubchiDatabase()`,
 * so it will not throw when the feature flag is off.
 */
export async function deletePubchiDatabase(): Promise<void> {
  try {
    await Dexie.delete('pubchi');
  } finally {
    instance = null;
  }
}
