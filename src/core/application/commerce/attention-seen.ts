import { z } from 'zod';
import { getCommerceAdapterMode, isDurableCommerceMode } from '@/config/commerce';
import { raiseLocalOrdersSeenAt, readLocalOrdersSeenAt } from '@/libs/commerce/marketplace-attention';
import { hasHttpStatus, isAppError, isNotFound } from '@/libs/error/error.utils';
import { HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { CommerceRecordNormalizer } from '@/pipes/commerce/commerce.normalizer';
import { CommerceHomeserverService } from '@/services/homeserver/commerce/commerce';
import { HomeserverService, PRIVATE_APP_DATA_PATH } from '@/services/homeserver/homeserver';
import { LocalCommerceService } from '@/services/local/commerce/commerce';
import { useAuthStore } from '@/stores/auth/auth.store';

export type MarketplaceAttentionSide = 'activity' | 'orders';

const attentionSeenRecordSchema = z.object({
  version: z.literal(1),
  activitySeenAt: z.number().int().nonnegative(),
  ordersSeenAt: z.number().int().nonnegative(),
});

type AttentionSeenRecord = z.infer<typeof attentionSeenRecordSchema>;

type RemoteRead = { kind: 'present'; record: AttentionSeenRecord } | { kind: 'absent' } | { kind: 'unavailable' };

const SIDE_FIELD = {
  activity: 'activitySeenAt',
  orders: 'ordersSeenAt',
} as const satisfies Record<MarketplaceAttentionSide, keyof AttentionSeenRecord>;

/**
 * The account's badge checkpoints: when this account last opened Activity
 * and Orders, on any browser.
 *
 * The durable marketplace service stores no read state, so the checkpoints
 * live in the owner's private homeserver document
 * `/priv/pubky.app/marketplace/v1/attention_seen.json` (ms epoch per side).
 * Each browser keeps a local copy (Dexie for Activity, local storage for
 * Orders) that the badge hooks read live. Opening a view raises the local
 * copy, then merges into the document (GET, per-side max, PUT). Mounting a
 * badge pulls the document and raises the local copies, so a view cleared
 * in one browser clears in every other.
 *
 * Checkpoints only move forward. A value from a device clock ahead of this
 * one is capped at this device's now. Without a session that can write
 * `/priv/pubky.app/` (or in the sandbox) the local copy is all there is,
 * and the badge behaves per browser.
 */
export class CommerceAttentionSeenApplication {
  private constructor() {}

  private static pullsInFlight = new Map<string, Promise<void>>();

  static async markSeen(ownerPubky: string, side: MarketplaceAttentionSide, now = Date.now()): Promise<void> {
    await this.raiseLocal(ownerPubky, side, now);
    if (!this.canUseRemote(ownerPubky)) return;
    try {
      const remote = await this.readRemote(ownerPubky);
      if (remote.kind === 'unavailable') return;
      const localActivity = await LocalCommerceService.getActivityReadCheckpoint(ownerPubky);
      const localOrders = readLocalOrdersSeenAt(ownerPubky);
      const current: AttentionSeenRecord =
        remote.kind === 'present' ? remote.record : { version: 1, activitySeenAt: 0, ordersSeenAt: 0 };
      const next: AttentionSeenRecord = {
        version: 1,
        activitySeenAt: Math.max(current.activitySeenAt, Math.min(localActivity, now)),
        ordersSeenAt: Math.max(current.ordersSeenAt, Math.min(localOrders, now)),
      };
      next[SIDE_FIELD[side]] = Math.max(next[SIDE_FIELD[side]], now);
      if (next.activitySeenAt === current.activitySeenAt && next.ordersSeenAt === current.ordersSeenAt) return;
      await CommerceHomeserverService.putJson(CommerceRecordNormalizer.attentionSeenUri(ownerPubky), next);
    } catch (error) {
      Logger.warn('Failed to save the marketplace badge checkpoint', { error });
    }
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

  private static async runPull(ownerPubky: string): Promise<void> {
    try {
      const remote = await this.readRemote(ownerPubky);
      if (remote.kind !== 'present') return;
      const now = Date.now();
      await this.raiseLocal(ownerPubky, 'activity', Math.min(remote.record.activitySeenAt, now));
      await this.raiseLocal(ownerPubky, 'orders', Math.min(remote.record.ordersSeenAt, now));
    } catch (error) {
      Logger.warn('Failed to load the marketplace badge checkpoint', { error });
    }
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

  /**
   * A document that fails its schema is left alone: never replaced
   * wholesale, never trusted.
   */
  private static async readRemote(ownerPubky: string): Promise<RemoteRead> {
    let payload: unknown;
    try {
      payload = await CommerceHomeserverService.fetchJson(CommerceRecordNormalizer.attentionSeenUri(ownerPubky));
    } catch (error) {
      if (isAppError(error) && isNotFound(error)) return { kind: 'absent' };
      if (hasHttpStatus(error, HttpStatusCode.FORBIDDEN) || hasHttpStatus(error, HttpStatusCode.UNAUTHORIZED)) {
        return { kind: 'unavailable' };
      }
      throw error;
    }
    const parsed = attentionSeenRecordSchema.safeParse(payload);
    if (!parsed.success) {
      Logger.warn('Ignoring an unreadable marketplace badge checkpoint');
      return { kind: 'unavailable' };
    }
    return { kind: 'present', record: parsed.data };
  }
}
