import type {
  Conversation,
  ExecutionScope,
  FeedProposalV1,
  FeedProposalV2,
  OwnerBindingV1,
  Phase0Purpose,
  PubchiAnswerV1,
  PubchiBotV1,
  PubchiOwnerContextV1,
  PubchiTarget,
  QueryResultV1,
} from '@/libs/pubchi/schemas';
import type { Pubky } from '@/models/models.types';

export type PubchiAskBody = {
  question: string;
  conversation?: Conversation;
  proposal_version?: 2;
  target_feed_id?: string;
  current_feed?: unknown;
  target?: PubchiTarget;
};

export type PubchiRequestBinding = {
  owner: Pubky;
  bot: Pubky;
  servedPurpose: 'ask';
  question: string;
  target: PubchiTarget;
  submitted_at: number;
  recordId: string;
};

export type PubchiQueryApplicationParams = {
  owner: Pubky;
  question: string;
  purpose: Phase0Purpose;
  nowSeconds?: number;
  context?: PubchiOwnerContextV1 | null;
  proposalVersion?: 2;
  targetFeedId?: string;
  currentFeed?: unknown;
  conversation?: Conversation;
  target?: PubchiTarget;
};

export type PubchiQuerySuccess =
  | { kind: 'query'; result: QueryResultV1 }
  | { kind: 'answer'; result: PubchiAnswerV1; binding?: PubchiRequestBinding }
  | { kind: 'feed'; result: FeedProposalV1; applyAllowed: true }
  | { kind: 'feed-v2'; result: FeedProposalV2; applyAllowed: false }
  | { kind: 'feed-unsupported'; code: 'FEED_UNSUPPORTED_LIKES' | 'FEED_UNSUPPORTED_REACH' | 'FEED_SPECS_INVALID' };

export type PubchiExecutionScope = ExecutionScope;

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
