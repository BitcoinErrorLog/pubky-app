import { create } from 'zustand';
import type { LoadedPubchi } from '@/application/pubchi/pubchi.types';
import type { PubchiConfigV1 } from '@/libs/pubchi/schemas';

export type PubchiStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PubchiStore {
  pubchi: LoadedPubchi | undefined;
  config: PubchiConfigV1 | null;
  status: PubchiStatus;
  lastLoadedAt: number | null;
  setPubchi: (pubchi: LoadedPubchi | undefined) => void;
  setConfig: (config: PubchiConfigV1 | null) => void;
  setStatus: (status: PubchiStatus) => void;
  markLoaded: () => void;
  clear: () => void;
}

const initialState = {
  pubchi: undefined,
  config: null,
  status: 'idle' as PubchiStatus,
  lastLoadedAt: null,
};

export const usePubchiStore = create<PubchiStore>((set) => ({
  ...initialState,
  setPubchi: (pubchi) => set({ pubchi }),
  setConfig: (config) => set({ config }),
  setStatus: (status) => set({ status }),
  markLoaded: () => set({ status: 'ready', lastLoadedAt: Date.now() }),
  clear: () => set(initialState),
}));
