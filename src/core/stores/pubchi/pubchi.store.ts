import { create } from 'zustand';
import type { LoadedPubchi } from '@/application/pubchi/pubchi.types';
import type { PubchiConfigV1, PubchiOwnerContextV1 } from '@/libs/pubchi/schemas';
import type { Pubky } from '@/models/models.types';

type StoredPubchi = Omit<LoadedPubchi, 'phrase'>;
type NoPhrase<T> = T & { phrase?: never };
export type PubchiFlyoutPrefill = {
  question: string;
  source: 'post-menu' | 'chip';
};
export type PubchiFlyoutState = {
  open: boolean;
  prefill?: PubchiFlyoutPrefill;
};

export interface PubchiStore {
  pubchi: StoredPubchi | undefined;
  config: PubchiConfigV1 | null;
  context: PubchiOwnerContextV1 | null;
  ownerPubky: Pubky | null;
  lastUpdatedAt: number | null;
  flyout: PubchiFlyoutState;
  setPubchi: (pubchi: NoPhrase<StoredPubchi> | undefined, ownerPubky: Pubky | null) => void;
  setConfig: (config: PubchiConfigV1 | null, ownerPubky: Pubky | null) => void;
  setContext: (context: PubchiOwnerContextV1 | null, ownerPubky: Pubky | null) => void;
  openFlyout: (prefill?: PubchiFlyoutPrefill) => void;
  closeFlyout: () => void;
  consumePrefill: () => PubchiFlyoutPrefill | undefined;
  clear: () => void;
}

const initialState = {
  pubchi: undefined,
  config: null,
  context: null,
  ownerPubky: null,
  lastUpdatedAt: null,
  flyout: { open: false },
};

export const usePubchiStore = create<PubchiStore>((set, get) => ({
  ...initialState,
  setPubchi: (pubchi, ownerPubky) => {
    if (pubchi && Object.prototype.hasOwnProperty.call(pubchi, 'phrase')) {
      throw new Error('Pubchi recovery phrase cannot be stored');
    }
    set({ pubchi, ownerPubky, lastUpdatedAt: Date.now() });
  },
  setConfig: (config, ownerPubky) => set({ config, ownerPubky, lastUpdatedAt: Date.now() }),
  setContext: (context, ownerPubky) => set({ context, ownerPubky, lastUpdatedAt: Date.now() }),
  openFlyout: (prefill) => set({ flyout: { open: true, ...(prefill ? { prefill } : {}) } }),
  closeFlyout: () => set({ flyout: { open: false } }),
  consumePrefill: (): PubchiFlyoutPrefill | undefined => {
    const prefill = get().flyout.prefill;
    if (prefill) set({ flyout: { open: true } });
    return prefill;
  },
  clear: () => set(initialState),
}));
