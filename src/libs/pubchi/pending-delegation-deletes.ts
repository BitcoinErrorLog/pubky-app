/**
 * Durable record of device delegations that still need a homeserver DELETE.
 * Survives `deletePubchiDatabase()` / sign-out so the next session of the
 * same owner can finish the job. Not a background queue — drained by
 * `PubchiApplication.unpublishKnownDelegations` while that owner has write
 * capability (logout, and sign-in of the same owner). A previous identity's
 * remote objects cannot be revoked without that identity's live session.
 */
import { Logger } from '@/libs/logger/logger';
import { zPubky } from '@/libs/pubchi/schemas/zod';

export const PENDING_DELEGATION_DELETES_KEY = 'pubchi.pendingDelegationDeletes';
export const PENDING_DELEGATION_DELETES_MAX = 32;

export type PendingDelegationDelete = {
  owner: string;
  signer: string;
};

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function parsePendingEntry(item: unknown): PendingDelegationDelete | undefined {
  if (item === null || typeof item !== 'object') return undefined;
  const record = item as { owner?: unknown; signer?: unknown };
  const owner = zPubky.safeParse(record.owner);
  const signer = zPubky.safeParse(record.signer);
  if (!owner.success || !signer.success) return undefined;
  return { owner: owner.data, signer: signer.data };
}

function capFifo(items: PendingDelegationDelete[]): PendingDelegationDelete[] {
  const unique = new Map(items.map((item) => [`${item.owner}:${item.signer}`, item]));
  const uniqueItems = [...unique.values()];
  if (uniqueItems.length <= PENDING_DELEGATION_DELETES_MAX) return uniqueItems;
  return uniqueItems.slice(uniqueItems.length - PENDING_DELEGATION_DELETES_MAX);
}

export function readPendingDelegationDeletes(): PendingDelegationDelete[] {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(PENDING_DELEGATION_DELETES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const entry = parsePendingEntry(item);
      return entry ? [entry] : [];
    });
  } catch {
    return [];
  }
}

export function writePendingDelegationDeletes(items: PendingDelegationDelete[]): void {
  if (!canUseLocalStorage()) return;
  const next = capFifo(
    items.flatMap((item) => {
      const entry = parsePendingEntry(item);
      return entry ? [entry] : [];
    }),
  );
  try {
    localStorage.setItem(PENDING_DELEGATION_DELETES_KEY, JSON.stringify(next));
  } catch (error) {
    Logger.warn('Pubchi pending delegation deletes persist failed', { error });
  }
}

export function rememberPendingDelegationDeletes(items: PendingDelegationDelete[]): void {
  writePendingDelegationDeletes([...readPendingDelegationDeletes(), ...items]);
}

/**
 * Append pending DELETEs for other identities without evicting `protectOwner`'s
 * existing records. The FIFO-32 cap still applies to everyone else: if
 * `protectOwner` already occupies all 32 slots, foreign rows cannot be stored
 * and are dropped (logged). That case is lossy by construction of the cap.
 */
export function rememberPendingDelegationDeletesPreservingOwner(
  protectOwner: string,
  items: PendingDelegationDelete[],
): void {
  const incoming = items.flatMap((item) => {
    const entry = parsePendingEntry(item);
    return entry && entry.owner !== protectOwner ? [entry] : [];
  });
  if (incoming.length === 0) return;

  const existing = readPendingDelegationDeletes();
  const protectedItems = existing.filter((item) => item.owner === protectOwner);
  const remaining = Math.max(0, PENDING_DELEGATION_DELETES_MAX - protectedItems.length);
  if (remaining === 0) {
    Logger.warn('Pubchi pending delegation deletes cap full for signed-in owner; foreign records not stored', {
      protectOwner,
      dropped: incoming.length,
    });
    return;
  }

  const others = [...existing.filter((item) => item.owner !== protectOwner), ...incoming];
  const uniqueOthers = capFifo(others);
  const cappedOthers = uniqueOthers.slice(Math.max(0, uniqueOthers.length - remaining));
  const keptKeys = new Set(cappedOthers.map((item) => `${item.owner}:${item.signer}`));
  const dropped = incoming.filter((item) => !keptKeys.has(`${item.owner}:${item.signer}`)).length;
  if (dropped > 0) {
    Logger.warn('Pubchi pending delegation deletes cap dropped foreign records', { protectOwner, dropped });
  }
  writePendingDelegationDeletes([...cappedOthers, ...protectedItems]);
}

export function replacePendingDelegationDeletesForOwner(owner: string, failed: PendingDelegationDelete[]): void {
  writePendingDelegationDeletes([...readPendingDelegationDeletes().filter((item) => item.owner !== owner), ...failed]);
}
