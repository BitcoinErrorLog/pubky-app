import type { Conversation, Phase0Purpose } from '@/libs/pubchi/schemas';
import type { Pubky } from '@/models/models.types';

export type TCreatePubchiParams = {
  displayName: string;
};

export type TConfirmPubchiBackupParams = {
  phrase: string;
  confirmations: ReadonlyArray<{ position: number; word: string }>;
};

export type TPubchiQueryParams = {
  question: string;
  purpose: Phase0Purpose;
  conversation?: Conversation;
  proposalVersion?: 2;
  targetFeedId?: string;
  currentFeed?: unknown;
};

export type TPubchiOwnerParam = {
  owner: Pubky;
};
