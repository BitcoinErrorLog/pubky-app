import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readOrdersSeenAt } from '@/libs/commerce/marketplace-attention';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { CommerceActivityCheckpointModel } from '@/models/commerce/commerce.models';
import { CommerceHomeserverService } from '@/services/homeserver/commerce/commerce';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalCommerceService } from '@/services/local/commerce/commerce';
import { useAuthStore } from '@/stores/auth/auth.store';
import { ATTENTION_SEEN_WRITE_DEBOUNCE_MS, CommerceAttentionSeenApplication } from './attention-seen';

const state = vi.hoisted(() => ({ mode: 'transaction-service' as string }));

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommerceAdapterMode: () => state.mode };
});

const OWNER = 'o'.repeat(52);
const OTHER = 'p'.repeat(52);
const BASE = `pubky://${OWNER}/priv/pubky.app/marketplace/v1/attention_seen`;
const DIR = { activity: `${BASE}/activity/`, orders: `${BASE}/orders/` } as const;
const T0 = Date.parse('2026-09-24T14:00:00.000Z');
const NOW = Date.parse('2026-09-24T16:00:00.000Z');

const forbidden = () =>
  new AppError({
    category: ErrorCategory.Client,
    code: ClientErrorCode.BAD_REQUEST,
    message: 'HTTP 403',
    service: ErrorService.Homeserver,
    operation: 'test',
    context: { statusCode: 403 },
  });

const entry = (side: keyof typeof DIR, at: number) => `${DIR[side]}${String(at).padStart(13, '0')}`;

/**
 * A homeserver private tree shared by every tab and browser in a test.
 * `holdLists` parks each list call until `releaseLists` runs, so a test can
 * line up two writers that both read before either writes.
 */
function homeserver(seed: string[] = []) {
  const files = new Set(seed);
  let held: Array<() => void> | null = null;
  const snapshot = (directory: string) => [...files].filter((url) => url.startsWith(directory)).sort();
  vi.spyOn(CommerceHomeserverService, 'list').mockImplementation(async (directory) => {
    const result = snapshot(directory);
    if (held) await new Promise<void>((release) => held!.push(release));
    return result;
  });
  const put = vi.spyOn(CommerceHomeserverService, 'putJson').mockImplementation(async (url) => {
    files.add(url);
  });
  const del = vi.spyOn(CommerceHomeserverService, 'delete').mockImplementation(async (url) => {
    files.delete(url);
  });
  return {
    files,
    put,
    del,
    holdLists: () => {
      held = [];
    },
    releaseLists: () => {
      const waiting = held ?? [];
      held = null;
      for (const release of waiting) release();
    },
    latest: (side: keyof typeof DIR) =>
      snapshot(DIR[side]).reduce((max, url) => Math.max(max, Number(url.slice(url.lastIndexOf('/') + 1))), 0),
  };
}

/** A fresh browser for the same account: nothing in Dexie or local storage. */
async function switchToFreshBrowser() {
  await CommerceActivityCheckpointModel.table.clear();
  window.localStorage.clear();
}

async function settleDebounce() {
  await vi.advanceTimersByTimeAsync(ATTENTION_SEEN_WRITE_DEBOUNCE_MS + 1);
}

describe('CommerceAttentionSeenApplication (per-account badge checkpoints)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
    state.mode = 'transaction-service';
    useAuthStore.setState({ currentUserPubky: OWNER });
    vi.spyOn(HomeserverService, 'hasActiveSession').mockReturnValue(true);
    vi.spyOn(HomeserverService, 'canCurrentSessionWrite').mockReturnValue(true);
    await switchToFreshBrowser();
  });

  afterEach(() => {
    CommerceAttentionSeenApplication.resetPendingWrites();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears Activity and Orders in a second browser after the first browser opened them', async () => {
    const remote = homeserver();

    const activity = CommerceAttentionSeenApplication.markSeen(OWNER, 'activity', T0);
    const orders = CommerceAttentionSeenApplication.markSeen(OWNER, 'orders', T0 + 1_000);
    await settleDebounce();
    await Promise.all([activity, orders]);
    expect(remote.latest('activity')).toBe(T0);
    expect(remote.latest('orders')).toBe(T0 + 1_000);

    await switchToFreshBrowser();
    await CommerceAttentionSeenApplication.pull(OWNER);

    expect(await LocalCommerceService.getActivityReadCheckpoint(OWNER)).toBe(T0);
    expect(readOrdersSeenAt(OWNER, window.localStorage)).toBe(T0 + 1_000);
  });

  it('never moves a side backward when two browsers read before either writes', async () => {
    // Both browsers start from activity = orders = T0. Browser A saves Orders
    // at T0+20s, browser B saves Activity at T0+30s. Both read first, then B
    // writes, then A writes: a read-modify-write of one document would put
    // Activity back to T0.
    const remote = homeserver([entry('activity', T0), entry('orders', T0)]);
    remote.holdLists();

    const browserA = CommerceAttentionSeenApplication.markSeen(OWNER, 'orders', T0 + 20_000);
    const browserB = CommerceAttentionSeenApplication.markSeen(OWNER, 'activity', T0 + 30_000);
    await settleDebounce();
    remote.releaseLists();
    await Promise.all([browserA, browserB]);

    expect(remote.latest('activity')).toBe(T0 + 30_000);
    expect(remote.latest('orders')).toBe(T0 + 20_000);
  });

  it('keeps the newer checkpoint when a slower tab lands an older one on the same side', async () => {
    const remote = homeserver([entry('orders', T0)]);
    remote.holdLists();

    // This tab read T0 and will write T0+15s. Meanwhile another tab or
    // browser has already written T0+20s.
    const slowTab = CommerceAttentionSeenApplication.markSeen(OWNER, 'orders', T0 + 15_000);
    await settleDebounce();
    remote.files.add(entry('orders', T0 + 20_000));
    remote.releaseLists();
    await slowTab;

    expect(remote.latest('orders')).toBe(T0 + 20_000);
    expect(remote.files.has(entry('orders', T0 + 20_000))).toBe(true);
    await switchToFreshBrowser();
    await CommerceAttentionSeenApplication.pull(OWNER);
    expect(readOrdersSeenAt(OWNER, window.localStorage)).toBe(T0 + 20_000);
  });

  it('prunes only entries older than the one it wrote', async () => {
    const remote = homeserver([entry('activity', T0), entry('activity', T0 + 1)]);

    const write = CommerceAttentionSeenApplication.markSeen(OWNER, 'activity', T0 + 5_000);
    await settleDebounce();
    await write;

    expect([...remote.files]).toEqual([entry('activity', T0 + 5_000)]);
  });

  it('turns a burst of seen moments into one write', async () => {
    const remote = homeserver();

    const writes = [
      CommerceAttentionSeenApplication.markSeen(OWNER, 'orders', T0),
      CommerceAttentionSeenApplication.markSeen(OWNER, 'orders', T0 + 1_000),
      CommerceAttentionSeenApplication.markSeen(OWNER, 'orders', T0 + 2_000),
    ];
    await vi.advanceTimersByTimeAsync(ATTENTION_SEEN_WRITE_DEBOUNCE_MS - 1);
    expect(remote.put).not.toHaveBeenCalled();
    await settleDebounce();
    await Promise.all(writes);

    expect(remote.put).toHaveBeenCalledOnce();
    expect(remote.latest('orders')).toBe(T0 + 2_000);
  });

  it('writes nothing when the homeserver already holds a checkpoint at least as new', async () => {
    const remote = homeserver([entry('activity', T0 + 60_000)]);

    const write = CommerceAttentionSeenApplication.markSeen(OWNER, 'activity', T0);
    await settleDebounce();
    await write;

    expect(remote.put).not.toHaveBeenCalled();
    expect(remote.del).not.toHaveBeenCalled();
  });

  it('caps a checkpoint saved by a device whose clock runs ahead', async () => {
    homeserver([entry('activity', NOW + 24 * 60 * 60 * 1000)]);

    await CommerceAttentionSeenApplication.pull(OWNER);

    expect(await LocalCommerceService.getActivityReadCheckpoint(OWNER)).toBe(NOW);
  });

  it('ignores entries that are not checkpoint names', async () => {
    homeserver([`${DIR.orders}notes.json`, entry('orders', T0)]);

    await CommerceAttentionSeenApplication.pull(OWNER);

    expect(readOrdersSeenAt(OWNER, window.localStorage)).toBe(T0);
  });

  it('keeps the checkpoint local when the homeserver refuses the private path', async () => {
    const remote = homeserver();
    vi.mocked(CommerceHomeserverService.list).mockRejectedValue(forbidden());

    const write = CommerceAttentionSeenApplication.markSeen(OWNER, 'orders', T0);
    await settleDebounce();
    await write;

    expect(remote.put).not.toHaveBeenCalled();
    expect(readOrdersSeenAt(OWNER, window.localStorage)).toBe(T0);
  });

  it('keeps the checkpoint in this browser only when the session cannot write /priv', async () => {
    vi.mocked(HomeserverService.canCurrentSessionWrite).mockReturnValue(false);
    const remote = homeserver();

    await CommerceAttentionSeenApplication.markSeen(OWNER, 'activity', T0);
    await CommerceAttentionSeenApplication.pull(OWNER);

    expect(CommerceHomeserverService.list).not.toHaveBeenCalled();
    expect(remote.put).not.toHaveBeenCalled();
    expect(await LocalCommerceService.getActivityReadCheckpoint(OWNER)).toBe(T0);
  });

  it('drops a scheduled write when the account changes before it runs', async () => {
    const remote = homeserver();

    const write = CommerceAttentionSeenApplication.markSeen(OWNER, 'orders', T0);
    useAuthStore.setState({ currentUserPubky: OTHER });
    await settleDebounce();
    await write;

    expect(remote.put).not.toHaveBeenCalled();
  });

  it('never reads or writes another account’s checkpoints', async () => {
    useAuthStore.setState({ currentUserPubky: OTHER });
    const remote = homeserver();

    await CommerceAttentionSeenApplication.markSeen(OWNER, 'activity', T0);
    await CommerceAttentionSeenApplication.pull(OWNER);

    expect(CommerceHomeserverService.list).not.toHaveBeenCalled();
    expect(remote.put).not.toHaveBeenCalled();
  });

  it('stays local in the sandbox', async () => {
    state.mode = 'sandbox';
    const remote = homeserver();

    await CommerceAttentionSeenApplication.markSeen(OWNER, 'orders', T0);

    expect(CommerceHomeserverService.list).not.toHaveBeenCalled();
    expect(remote.put).not.toHaveBeenCalled();
  });
});
