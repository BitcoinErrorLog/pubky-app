import type { Pubky } from '@/models/models.types';

export const PUBCHI_SYNC_CHANNEL = 'pubchi';
export const PUBCHI_SYNC_MAX_AGE_MS = 15_000;
export const PUBCHI_SYNC_DEBOUNCE_MS = 100;

export type PubchiSyncKind = 'created' | 'config-saved' | 'removed' | 'devices-changed' | 'signed-out';

export type PubchiSyncMessage = {
  owner: Pubky;
  kind: PubchiSyncKind;
  at: number;
};

export function publishPubchiSync(owner: Pubky | null, kind: PubchiSyncKind): void {
  if (!owner || typeof BroadcastChannel === 'undefined') return;

  const channel = new BroadcastChannel(PUBCHI_SYNC_CHANNEL);
  try {
    channel.postMessage({ owner, kind, at: Date.now() } satisfies PubchiSyncMessage);
  } finally {
    channel.close();
  }
}

export function subscribeToPubchiSync(onMessage: (message: PubchiSyncMessage) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;

  const channel = new BroadcastChannel(PUBCHI_SYNC_CHANNEL);
  const handleMessage = (event: MessageEvent<unknown>) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    const candidate = message as Partial<PubchiSyncMessage>;
    if (
      typeof candidate.owner !== 'string' ||
      typeof candidate.kind !== 'string' ||
      typeof candidate.at !== 'number'
    ) {
      return;
    }
    onMessage(candidate as PubchiSyncMessage);
  };

  channel.addEventListener('message', handleMessage);
  return () => {
    channel.removeEventListener('message', handleMessage);
    channel.close();
  };
}
