import { create } from 'zustand';
import type { LoadedPubchi } from '@/application/pubchi/pubchi.types';
import type { PubchiConfigV1 } from '@/libs/pubchi/schemas';
import type { Pubky } from '@/models/models.types';

type StoredPubchi = Omit<LoadedPubchi, 'phrase'>;
type NoPhrase<T> = T & { phrase?: never };

export interface PubchiStore {
  pubchi: StoredPubchi | undefined;
  config: PubchiConfigV1 | null;
  ownerPubky: Pubky | null;
  setPubchi: (pubchi: NoPhrase<StoredPubchi> | undefined, ownerPubky: Pubky | null) => void;
  setConfig: (config: PubchiConfigV1 | null, ownerPubky: Pubky | null) => void;
  clear: () => void;
}

const initialState = {
  pubchi: undefined,
  config: null,
  ownerPubky: null,
};

export const usePubchiStore = create<PubchiStore>((set) => ({
  ...initialState,
  setPubchi: (pubchi, ownerPubky) => {
    if (pubchi && Object.prototype.hasOwnProperty.call(pubchi, 'phrase')) {
      throw new Error('Pubchi recovery phrase cannot be stored');
    }
    set({ pubchi, ownerPubky });
  },
  setConfig: (config, ownerPubky) => set({ config, ownerPubky }),
  clear: () => set(initialState),
}));
