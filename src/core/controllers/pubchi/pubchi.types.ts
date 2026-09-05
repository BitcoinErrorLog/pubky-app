import type { Pubky } from '@/models/models.types';

export type TPubchiEnrollParams = {
  bot: string;
};

export type TPubchiQueryParams = {
  question: string;
  secretSeed: Uint8Array;
};

export type TPubchiOwnerParam = {
  owner: Pubky;
};
