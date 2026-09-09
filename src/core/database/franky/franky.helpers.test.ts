import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '@/controllers/auth/auth';
import { db } from '@/database/franky/franky';
import { clearDatabase } from '@/database/franky/franky.helpers';

// Mock pubky-app-specs to avoid WebAssembly issues (same seam as auth.test.ts).
vi.mock('pubky-app-specs', () => ({
  default: vi.fn(() => Promise.resolve()),
}));

describe('clearDatabase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears every table registered in the Dexie schema exactly once', async () => {
    if (!db.isOpen()) {
      await db.open();
    }

    // The enumeration source of truth: every table the active schema declares.
    const schemaTableNames = db.tables.map((table) => table.name).sort();
    const clearSpies = db.tables.map((table) => ({ name: table.name, spy: vi.spyOn(table, 'clear') }));

    await clearDatabase();

    const clearedTableNames = clearSpies
      .filter(({ spy }) => spy.mock.calls.length > 0)
      .map(({ name }) => name)
      .sort();

    // Set equality: every schema table wiped, no table wiped that is not in the schema.
    expect(clearedTableNames).toEqual(schemaTableNames);
    // Explicit guard: the payment-claim gate state must never survive sign-out.
    expect(schemaTableNames).toContain('commerce_payment_claims');
    expect(clearedTableNames).toContain('commerce_payment_claims');

    for (const { name, spy } of clearSpies) {
      expect(spy, `table "${name}" must be cleared exactly once`).toHaveBeenCalledTimes(1);
    }
  });

  it('is invoked by the AuthController sign-out path (cleanupLocalState)', async () => {
    const helpers = await import('@/database/franky/franky.helpers');
    const clearDatabaseSpy = vi.spyOn(helpers, 'clearDatabase');

    AuthController.resetCleanupLocalStateGuard();
    await AuthController.logout();

    expect(clearDatabaseSpy).toHaveBeenCalled();
  });
});
