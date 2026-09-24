import { getCommerceAdapterMode, isDurableCommerceMode } from '@/config/commerce';
import { raiseLocalOrdersSeenAt, readLocalOrdersSeenAt } from '@/libs/commerce/marketplace-attention';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { CommerceRecordNormalizer } from '@/pipes/commerce/commerce.normalizer';
import { CommerceHomeserverService } from '@/services/homeserver/commerce/commerce';
import { HomeserverService, PRIVATE_APP_DATA_PATH } from '@/services/homeserver/homeserver';
import { LocalCommerceService } from '@/services/local/commerce/commerce';
import { useAuthStore } from '@/stores/auth/auth.store';

export type MarketplaceAttentionSide = 'activity' | 'orders';

/** Quiet period before a burst of "seen" moments becomes one homeserver write. */
export const ATTENTION_SEEN_WRITE_DEBOUNCE_MS = 2_000;

/** Entry names are ms epochs zero-padded to this width, so names sort by value. */
const ENTRY_NAME_DIGITS = 13;
const ENTRY_NAME = /^\d{13}$/;
/** Pruning keeps each directory to a handful of entries; this bounds one read. */
const ENTRY_LIST_LIMIT = 100;

type Entry = { url: string; at: number };
type Listing = { kind: 'entries'; entries: Entry[] } | { kind: 'unavailable' };
type PendingWrite = { timer: ReturnType<typeof setTimeout>; done: Promise<void>; resolve: () => void };

/**
 * The account's badge checkpoints: when this account last opened Activity
 * and Orders, on any browser.
 *
 * The durable marketplace service stores no read state, so the checkpoints
 * live on the owner's homeserver under
 * `/priv/pubky.app/marketplace/v1/attention_seen/{activity|orders}/`. Each
 * write adds a new entry named by the checkpoint it records and never
 * rewrites an existing one; the checkpoint is the largest entry name. The
 * homeserver has no conditional write, and a read-modify-write of one
 * document lets a slower writer put back an older value. A set of
 * immutable entries whose maximum is the value cannot move backward under
 * any interleaving of tabs or browsers. After a write, entries below the one
 * just written are deleted; an entry is only deleted when a larger one
 * exists, so the maximum survives concurrent pruning too.
 *
 * Each browser keeps a local copy (Dexie for Activity, local storage for
 * Orders) that the badge hooks read live. `markSeen` raises the local copy
 * at once and schedules one debounced write, which is skipped when the
 * homeserver already holds a checkpoint at least as new. `pull` raises the
 * local copies to the homeserver's, capped at this device's now so a clock
 * running ahead cannot hide future activity. Without a session that can
 * write `/priv/pubky.app/` (or in the sandbox) the local copy is all there
 * is, and the badge behaves per browser.
 */
export class CommerceAttentionSeenApplication {
  private constructor() {}

  private static pullsInFlight = new Map<string, Promise<void>>();
  private static pendingWrites = new Map<string, PendingWrite>();

  /**
   * Records that this account saw `side` at `now`. Resolves once the
   * debounced homeserver write for this burst has settled.
   */
  static async markSeen(ownerPubky: string, side: MarketplaceAttentionSide, now = Date.now()): Promise<void> {
    await this.raiseLocal(ownerPubky, side, now);
    if (!this.canUseRemote(ownerPubky)) return;
    await this.scheduleWrite(ownerPubky, side);
  }

  /** Raises this browser's checkpoints to the account's. One read per owner at a time. */
  static async pull(ownerPubky: string): Promise<void> {
    if (!this.canUseRemote(ownerPubky)) return;
    const inFlight = this.pullsInFlight.get(ownerPubky);
    if (inFlight) return await inFlight;
    const run = this.runPull(ownerPubky).finally(() => {
      this.pullsInFlight.delete(ownerPubky);
    });
    this.pullsInFlight.set(ownerPubky, run);
    return await run;
  }

  /** Test support: drops scheduled writes without running them. */
  static resetPendingWrites(): void {
    for (const pending of this.pendingWrites.values()) {
      clearTimeout(pending.timer);
      pending.resolve();
    }
    this.pendingWrites.clear();
  }

  private static scheduleWrite(ownerPubky: string, side: MarketplaceAttentionSide): Promise<void> {
    const key = `${ownerPubky}|${side}`;
    const existing = this.pendingWrites.get(key);
    if (existing) clearTimeout(existing.timer);
    let resolve: () => void = () => {};
    const done = existing?.done ?? new Promise<void>((settle) => (resolve = settle));
    const pending: PendingWrite = {
      done,
      resolve: existing?.resolve ?? resolve,
      timer: setTimeout(() => {
        this.pendingWrites.delete(key);
        void this.writeCheckpoint(ownerPubky, side).finally(pending.resolve);
      }, ATTENTION_SEEN_WRITE_DEBOUNCE_MS),
    };
    this.pendingWrites.set(key, pending);
    return done;
  }

  private static async writeCheckpoint(ownerPubky: string, side: MarketplaceAttentionSide): Promise<void> {
    // The account may have changed or lost its grant during the quiet period.
    if (!this.canUseRemote(ownerPubky)) return;
    try {
      const local =
        side === 'activity'
          ? await LocalCommerceService.getActivityReadCheckpoint(ownerPubky)
          : readLocalOrdersSeenAt(ownerPubky);
      const value = Math.min(local, Date.now());
      if (!(value > 0)) return;
      const listing = await this.listEntries(ownerPubky, side);
      if (listing.kind === 'unavailable') return;
      if (listing.entries.some(({ at }) => at >= value)) return;
      const directory = CommerceRecordNormalizer.attentionSeenDirectoryUri(ownerPubky, side);
      await CommerceHomeserverService.putJson(`${directory}${entryName(value)}`, { version: 1, seenAt: value });
      await Promise.allSettled(listing.entries.map(({ url }) => CommerceHomeserverService.delete(url)));
    } catch (error) {
      Logger.warn('Failed to save the marketplace badge checkpoint', { error });
    }
  }

  private static async runPull(ownerPubky: string): Promise<void> {
    try {
      const [activity, orders] = await Promise.all([
        this.listEntries(ownerPubky, 'activity'),
        this.listEntries(ownerPubky, 'orders'),
      ]);
      const now = Date.now();
      await this.raiseLocal(ownerPubky, 'activity', Math.min(latest(activity), now));
      await this.raiseLocal(ownerPubky, 'orders', Math.min(latest(orders), now));
    } catch (error) {
      Logger.warn('Failed to load the marketplace badge checkpoint', { error });
    }
  }

  private static async listEntries(ownerPubky: string, side: MarketplaceAttentionSide): Promise<Listing> {
    let urls: string[];
    try {
      urls = await CommerceHomeserverService.list(
        CommerceRecordNormalizer.attentionSeenDirectoryUri(ownerPubky, side),
        ENTRY_LIST_LIMIT,
      );
    } catch (error) {
      if (hasHttpStatus(error, HttpStatusCode.FORBIDDEN) || hasHttpStatus(error, HttpStatusCode.UNAUTHORIZED)) {
        return { kind: 'unavailable' };
      }
      throw error;
    }
    const entries: Entry[] = [];
    for (const url of urls) {
      const name = url.slice(url.lastIndexOf('/') + 1);
      if (ENTRY_NAME.test(name)) entries.push({ url, at: Number(name) });
    }
    return { kind: 'entries', entries };
  }

  private static async raiseLocal(ownerPubky: string, side: MarketplaceAttentionSide, at: number): Promise<void> {
    if (!(at > 0)) return;
    if (side === 'activity') {
      await LocalCommerceService.markActivityRead(ownerPubky, at);
      return;
    }
    raiseLocalOrdersSeenAt(ownerPubky, at);
  }

  private static canUseRemote(ownerPubky: string): boolean {
    if (!isDurableCommerceMode(getCommerceAdapterMode())) return false;
    if (useAuthStore.getState().currentUserPubky !== ownerPubky) return false;
    return HomeserverService.hasActiveSession() && HomeserverService.canCurrentSessionWrite(PRIVATE_APP_DATA_PATH);
  }
}

function entryName(at: number): string {
  return String(Math.trunc(at)).padStart(ENTRY_NAME_DIGITS, '0');
}

function latest(listing: Listing): number {
  if (listing.kind === 'unavailable') return 0;
  return listing.entries.reduce((max, { at }) => Math.max(max, at), 0);
}
