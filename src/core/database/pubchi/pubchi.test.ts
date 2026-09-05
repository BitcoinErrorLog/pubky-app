import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deletePubchiDatabase, resetPubchiDatabaseForTests } from './pubchi';

describe('deletePubchiDatabase', () => {
  afterEach(() => {
    resetPubchiDatabaseForTests();
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
});
