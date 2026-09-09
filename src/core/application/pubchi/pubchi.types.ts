import type {
  FeedProposalV1,
  OwnerBindingV1,
  Phase0Purpose,
  PubchiAnswerV1,
  PubchiBotV1,
  PubchiOwnerContextV1,
  QueryResultV1,
} from '@/libs/pubchi/schemas';
import type { Pubky } from '@/models/models.types';

export type PubchiAskBody = {
  question: string;
};

export type PubchiQueryApplicationParams = {
  owner: Pubky;
  question: string;
  purpose: Phase0Purpose;
  nowSeconds?: number;
  context?: PubchiOwnerContextV1 | null;
};

export type PubchiQuerySuccess =
  | { kind: 'query'; result: QueryResultV1 }
  | { kind: 'answer'; result: PubchiAnswerV1 }
  | { kind: 'feed'; result: FeedProposalV1; applyAllowed: true }
  | { kind: 'feed-unsupported'; code: 'FEED_UNSUPPORTED_LIKES' | 'FEED_UNSUPPORTED_REACH' | 'FEED_SPECS_INVALID' };

export type PubchiBindingWriteParams = {
  owner: Pubky;
  bot: Pubky;
};

export type PubchiBindingRecordResult = OwnerBindingV1;

export type CreatePubchiParams = {
  owner: Pubky;
  displayName: string;
  capabilities: string[];
};

export type CreatedPubchi = {
  bot: Pubky;
  displayName: string;
  createdAt: number;
  backupConfirmedAt: number | null;
  verified: boolean;
  phrase: string;
};

export type LoadedPubchi = Omit<CreatedPubchi, 'phrase'>;

export type ConfirmPubchiBackupParams = {
  owner: Pubky;
  phrase: string;
  confirmations: ReadonlyArray<{ position: number; word: string }>;
};

export type PubchiRemoteState = {
  pointer: PubchiBotV1;
  binding: OwnerBindingV1;
};
