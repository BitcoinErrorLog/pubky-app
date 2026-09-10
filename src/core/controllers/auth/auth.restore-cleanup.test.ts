import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '@/controllers/auth/auth';
import { db } from '@/database/franky/franky';
import { PUBLIC_CACHE_TABLES } from '@/database/franky/franky.helpers';
import * as vibeSessionAutoRestore from '@/libs/vibe-session/auto-restore';
import * as vibeSessionConfig from '@/libs/vibe-session/config';
import * as vibeSessionFragment from '@/libs/vibe-session/fragment';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';

const BRIDGE_ORIGIN = 'https://pubky.app';
const PERSISTED_PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;

const EXPECTED_PUBLIC_CACHE_TABLES = [
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
] as const;

const EXPECTED_PRIVATE_TABLES = [
  'user_relationships',
  'user_tags',
  'user_connections',
  'notifications',
  'post_tags',
  'post_streams',
  'unread_post_streams',
  'user_streams',
  'bookmarks',
  'commerce_listing_drafts',
  'commerce_sync_jobs',
  'commerce_reviews',
  'commerce_review_responses',
  'commerce_favorites',
  'commerce_shop_follows',
  'commerce_cart_items',
  'commerce_locks_correlations',
  'commerce_watch_snapshots',
  'commerce_watch_tombstones',
  'commerce_watch_alerts',
  'commerce_saved_searches',
  'commerce_activity_checkpoints',
  'commerce_delivery_addresses',
  'commerce_shipping_presets',
  'commerce_messaging_receivers',
  'commerce_messaging_links',
  'commerce_messaging_conversations',
  'commerce_messaging_messages',
  'commerce_messaging_outbox',
  'marketplace_tags',
  'hot_tags',
  'feeds',
  'moderation',
] as const;

const sorted = (values: Iterable<string>) => [...values].sort();

async function seedEveryTable(): Promise<void> {
  for (const table of db.tables) {
    expect(table.schema.primKey.keyPath).toBe('id');
    await db.table<{ id: string }>(table.name).put({ id: `restore-cleanup:${table.name}` });
  }
}

async function expectTableCounts(tableNames: readonly string[], expectedCount: number): Promise<void> {
  await Promise.all(
    tableNames.map(async (tableName) => {
      expect(await db.table(tableName).count(), tableName).toBe(expectedCount);
    }),
  );
}

async function runRealBridgeTimeoutRestore(currentUserPubky: Pubky | null) {
  useAuthStore.setState({
    session: null,
    sessionExport: null,
    currentUserPubky,
    hasProfile: currentUserPubky ? true : null,
    hasHydrated: true,
    isRestoringSession: false,
    sessionRestoreDeferred: false,
  });

  vi.useFakeTimers();
  const restorePromise = AuthController.restorePersistedSession();
  vi.advanceTimersByTime(15_000);
  vi.useRealTimers();
  return await restorePromise;
}

describe('AuthController restore cleanup with the real bridge and database', () => {
  beforeEach(() => {
    AuthController.resetCleanupLocalStateGuard();
    useAuthStore.getState().reset();
    vi.spyOn(vibeSessionConfig, 'getVibeSessionBridgeOrigin').mockReturnValue(BRIDGE_ORIGIN);
    vi.spyOn(vibeSessionConfig, 'getVibeId').mockReturnValue('marketplace-grid-test');
    vi.spyOn(vibeSessionFragment, 'takeFragmentSessionExport').mockReturnValue(null);
    vi.spyOn(vibeSessionAutoRestore, 'isVibeSessionAutoRestoreSuppressed').mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('classifies all 46 stores and clears private data after a no-identity bridge timeout', async () => {
    const expectedTables = [...EXPECTED_PUBLIC_CACHE_TABLES, ...EXPECTED_PRIVATE_TABLES];
    expect(db.tables).toHaveLength(46);
    expect(sorted(db.tables.map((table) => table.name))).toEqual(sorted(expectedTables));
    expect(sorted(PUBLIC_CACHE_TABLES)).toEqual(sorted(EXPECTED_PUBLIC_CACHE_TABLES));
    await seedEveryTable();
    const createElementSpy = vi.spyOn(document, 'createElement');

    await expect(runRealBridgeTimeoutRestore(null)).resolves.toEqual({ status: 'signed-out' });

    expect(createElementSpy).toHaveBeenCalledWith('iframe');
    await expectTableCounts(EXPECTED_PRIVATE_TABLES, 0);
    await expectTableCounts(EXPECTED_PUBLIC_CACHE_TABLES, 1);
  });

  it('still clears every store after a bridge timeout with persisted identity provenance', async () => {
    await seedEveryTable();

    await expect(runRealBridgeTimeoutRestore(PERSISTED_PUBKY)).resolves.toEqual({ status: 'signed-out' });

    await expectTableCounts([...EXPECTED_PUBLIC_CACHE_TABLES, ...EXPECTED_PRIVATE_TABLES], 0);
  });
});
