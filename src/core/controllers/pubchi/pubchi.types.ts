import type { Phase0Purpose } from '@/libs/pubchi/schemas';
import type { Pubky } from '@/models/models.types';

export type TPubchiEnrollParams = {
  bot: string;
};

export type TPubchiQueryParams = {
  question: string;
  purpose: Phase0Purpose;
  secretSeed: Uint8Array;
};

export type TPubchiOwnerParam = {
  owner: Pubky;
};
