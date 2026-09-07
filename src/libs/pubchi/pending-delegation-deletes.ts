/**
 * Durable record of device delegations that still need a homeserver DELETE.
 * Survives `deletePubchiDatabase()` / sign-out so the next session of the
 * same owner can finish the job. Not a background queue — drained only by
 * `PubchiApplication.unpublishKnownDelegations` while that owner has write
 * capability. A previous identity's remote objects cannot be revoked without
 * that identity's live session.
 */
export const PENDING_DELEGATION_DELETES_KEY = 'pubchi.pendingDelegationDeletes';

export type PendingDelegationDelete = {
  owner: string;
  signer: string;
};

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function readPendingDelegationDeletes(): PendingDelegationDelete[] {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(PENDING_DELEGATION_DELETES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingDelegationDelete => {
      if (item === null || typeof item !== 'object') return false;
      const record = item as { owner?: unknown; signer?: unknown };
      return typeof record.owner === 'string' && typeof record.signer === 'string';
    });
  } catch {
    return [];
  }
}

export function writePendingDelegationDeletes(items: PendingDelegationDelete[]): void {
  if (!canUseLocalStorage()) return;
  const unique = new Map(items.map((item) => [`${item.owner}:${item.signer}`, item]));
  localStorage.setItem(PENDING_DELEGATION_DELETES_KEY, JSON.stringify([...unique.values()]));
}

export function rememberPendingDelegationDeletes(items: PendingDelegationDelete[]): void {
  writePendingDelegationDeletes([...readPendingDelegationDeletes(), ...items]);
}

export function replacePendingDelegationDeletesForOwner(owner: string, failed: PendingDelegationDelete[]): void {
  writePendingDelegationDeletes([
    ...readPendingDelegationDeletes().filter((item) => item.owner !== owner),
    ...failed,
  ]);
}
