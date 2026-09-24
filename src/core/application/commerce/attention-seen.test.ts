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
import { CommerceAttentionSeenApplication } from './attention-seen';

const state = vi.hoisted(() => ({ mode: 'transaction-service' as string }));

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommerceAdapterMode: () => state.mode };
});

const OWNER = 'o'.repeat(52);
const OTHER = 'p'.repeat(52);
const DOC_URL = `pubky://${OWNER}/priv/pubky.app/marketplace/v1/attention_seen.json`;
const T_ACTIVITY = Date.parse('2026-09-24T14:00:00.000Z');
const T_ORDERS = Date.parse('2026-09-24T14:05:00.000Z');

const notFound = () =>
  new AppError({
    category: ErrorCategory.Client,
    code: ClientErrorCode.NOT_FOUND,
    message: 'HTTP 404',
    service: ErrorService.Homeserver,
    operation: 'test',
    context: { statusCode: 404 },
  });

/** One homeserver document shared by every "browser" in a test. */
function homeserverDocument(initial: unknown = null) {
  let doc: unknown = initial;
  vi.spyOn(CommerceHomeserverService, 'fetchJson').mockImplementation(async (url) => {
    expect(url).toBe(DOC_URL);
    if (doc === null) throw notFound();
    return structuredClone(doc);
  });
  const put = vi.spyOn(CommerceHomeserverService, 'putJson').mockImplementation(async (url, body) => {
    expect(url).toBe(DOC_URL);
    doc = structuredClone(body);
  });
  return { put, read: () => doc };
}

/** A fresh browser for the same account: nothing in Dexie or local storage. */
async function switchToFreshBrowser() {
  await CommerceActivityCheckpointModel.table.clear();
  window.localStorage.clear();
}

describe('CommerceAttentionSeenApplication (per-account badge checkpoints)', () => {
  beforeEach(async () => {
    state.mode = 'transaction-service';
    useAuthStore.setState({ currentUserPubky: OWNER });
    vi.spyOn(HomeserverService, 'hasActiveSession').mockReturnValue(true);
    vi.spyOn(HomeserverService, 'canCurrentSessionWrite').mockReturnValue(true);
    await switchToFreshBrowser();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears Activity and Orders in a second browser after the first browser opened them', async () => {
    const remote = homeserverDocument();

    await CommerceAttentionSeenApplication.markSeen(OWNER, 'activity', T_ACTIVITY);
    await CommerceAttentionSeenApplication.markSeen(OWNER, 'orders', T_ORDERS);
    expect(remote.read()).toEqual({ version: 1, activitySeenAt: T_ACTIVITY, ordersSeenAt: T_ORDERS });

    await switchToFreshBrowser();
    expect(await LocalCommerceService.getActivityReadCheckpoint(OWNER)).toBe(0);
    expect(readOrdersSeenAt(OWNER, window.localStorage)).toBe(0);

    await CommerceAttentionSeenApplication.pull(OWNER);

    expect(await LocalCommerceService.getActivityReadCheckpoint(OWNER)).toBe(T_ACTIVITY);
    expect(readOrdersSeenAt(OWNER, window.localStorage)).toBe(T_ORDERS);
  });

  it('tells mounted Orders badges to re-read when a pull raises the checkpoint', async () => {
    homeserverDocument({ version: 1, activitySeenAt: 0, ordersSeenAt: T_ORDERS });
    const listener = vi.fn();
    window.addEventListener('marketplace-orders-seen', listener);

    await CommerceAttentionSeenApplication.pull(OWNER);

    window.removeEventListener('marketplace-orders-seen', listener);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('merges into the saved document and never moves a side backward', async () => {
    const remote = homeserverDocument({ version: 1, activitySeenAt: T_ACTIVITY, ordersSeenAt: T_ORDERS });

    await CommerceAttentionSeenApplication.markSeen(OWNER, 'activity', T_ACTIVITY - 60_000);
    expect(remote.put).not.toHaveBeenCalled();

    await CommerceAttentionSeenApplication.markSeen(OWNER, 'activity', T_ORDERS + 60_000);
    expect(remote.read()).toEqual({ version: 1, activitySeenAt: T_ORDERS + 60_000, ordersSeenAt: T_ORDERS });
  });

  it('caps a checkpoint saved by a device whose clock runs ahead', async () => {
    const future = Date.now() + 24 * 60 * 60 * 1000;
    homeserverDocument({ version: 1, activitySeenAt: future, ordersSeenAt: 0 });

    const before = Date.now();
    await CommerceAttentionSeenApplication.pull(OWNER);
    const local = await LocalCommerceService.getActivityReadCheckpoint(OWNER);

    expect(local).toBeGreaterThanOrEqual(before);
    expect(local).toBeLessThan(future);
  });

  it('never replaces a document it cannot read', async () => {
    const remote = homeserverDocument({ version: 2, somethingElse: true });

    await CommerceAttentionSeenApplication.markSeen(OWNER, 'orders', T_ORDERS);

    expect(remote.put).not.toHaveBeenCalled();
    expect(readOrdersSeenAt(OWNER, window.localStorage)).toBe(T_ORDERS);
  });

  it('keeps the checkpoint in this browser only when the session cannot write /priv', async () => {
    vi.mocked(HomeserverService.canCurrentSessionWrite).mockReturnValue(false);
    const remote = homeserverDocument();

    await CommerceAttentionSeenApplication.markSeen(OWNER, 'activity', T_ACTIVITY);
    await CommerceAttentionSeenApplication.pull(OWNER);

    expect(CommerceHomeserverService.fetchJson).not.toHaveBeenCalled();
    expect(remote.put).not.toHaveBeenCalled();
    expect(await LocalCommerceService.getActivityReadCheckpoint(OWNER)).toBe(T_ACTIVITY);
  });

  it('never reads or writes another account’s document', async () => {
    useAuthStore.setState({ currentUserPubky: OTHER });
    const remote = homeserverDocument();

    await CommerceAttentionSeenApplication.markSeen(OWNER, 'activity', T_ACTIVITY);
    await CommerceAttentionSeenApplication.pull(OWNER);

    expect(CommerceHomeserverService.fetchJson).not.toHaveBeenCalled();
    expect(remote.put).not.toHaveBeenCalled();
  });

  it('stays local in the sandbox', async () => {
    state.mode = 'sandbox';
    const remote = homeserverDocument();

    await CommerceAttentionSeenApplication.markSeen(OWNER, 'orders', T_ORDERS);

    expect(CommerceHomeserverService.fetchJson).not.toHaveBeenCalled();
    expect(remote.put).not.toHaveBeenCalled();
  });
});
