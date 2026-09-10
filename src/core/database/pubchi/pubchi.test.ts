import Dexie, { type Table } from 'dexie';
import { indexedDB } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { pubchiBindingTableSchema } from '@/models/pubchi/binding.schema';
import { pubchiDeviceKeyTableSchema } from '@/models/pubchi/device-key.schema';
import { pubchiFeedProvenanceTableSchema } from '@/models/pubchi/feed-provenance.schema';
import { deletePubchiDatabase, getPubchiDatabase, resetPubchiDatabaseForTests } from './pubchi';

class LegacyPubchiDatabase extends Dexie {
  bindings!: Table<unknown>;
  deviceKeys!: Table<unknown>;
  feedProvenance!: Table<unknown>;

  constructor() {
    super('pubchi');
    this.version(3).stores({
      bindings: pubchiBindingTableSchema,
      deviceKeys: pubchiDeviceKeyTableSchema,
      feedProvenance: pubchiFeedProvenanceTableSchema,
    });
  }
}

describe('deletePubchiDatabase', () => {
  afterEach(() => {
    resetPubchiDatabaseForTests();
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    resetRuntimeConfigForTests();
    vi.restoreAllMocks();
  });

  it('drops the pubchi IndexedDB without opening it', async () => {
    const deleteSpy = vi.spyOn(Dexie, 'delete').mockResolvedValue(undefined);
    await deletePubchiDatabase();
    expect(deleteSpy).toHaveBeenCalledWith('pubchi');
  });

  it('resets the singleton even when Dexie.delete rejects', async () => {
    vi.spyOn(Dexie, 'delete').mockRejectedValue(new Error('idb gone'));
    await expect(deletePubchiDatabase()).rejects.toThrow('idb gone');
  });

  it('removes the v3 provenance table during the v4 upgrade', async () => {
    await deletePubchiDatabase();
    const legacy = new LegacyPubchiDatabase();
    const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
    await legacy.bindings.put({
      id: 'owner:bot',
      schema: 'pubchi-owner-binding',
      version: 1,
      owner: 'owner',
      bot: 'bot',
      status: 'active',
      created_at: 1,
      updated_at: 1,
    });
    await legacy.deviceKeys.put({
      id: 'owner:signer',
      owner: 'owner',
      signer: 'signer',
      key: keyPair.privateKey,
      created_at: 1,
      expires_at: 2,
    });
    await legacy.feedProvenance.put({
      id: 'owner:feed',
      owner: 'owner',
      feedId: 'feed',
      createdAt: 1,
    });
    legacy.close();

    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const db = getPubchiDatabase();
    await db.open();

    expect(legacy.isOpen()).toBe(false);
    expect(db.tables.map((table) => table.name)).not.toContain('feedProvenance');
    await expect(db.bindings.get('owner:bot')).resolves.toMatchObject({ owner: 'owner', bot: 'bot' });
    await expect(db.deviceKeys.get('owner:signer')).resolves.toMatchObject({ owner: 'owner', signer: 'signer' });
    await deletePubchiDatabase();
    expect(indexedDB).toBeDefined();
  });

  it('logs and recovers when another tab blocks the v4 upgrade', async () => {
    await deletePubchiDatabase();
    const legacy = new LegacyPubchiDatabase();
    await legacy.open();
    legacy.on('versionchange', () => false);

    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const warn = vi.spyOn(Logger, 'warn');
    const db = getPubchiDatabase();
    const opening = db.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    legacy.close();

    await opening;

    expect(warn).toHaveBeenCalledWith('Pubchi database upgrade is blocked by another tab');
    expect(db.isOpen()).toBe(true);
    await deletePubchiDatabase();
  });
});
