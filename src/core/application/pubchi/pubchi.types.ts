import type { FeedProposalV1, OwnerBindingV1, Phase0Purpose, QueryResultV1 } from '@/libs/pubchi/schemas';
import type { Pubky } from '@/models/models.types';

export type PubchiAskBody = {
  question: string;
};

export type PubchiQueryApplicationParams = {
  owner: Pubky;
  question: string;
  purpose: Phase0Purpose;
  nowSeconds?: number;
};

export type PubchiQuerySuccess =
  | { kind: 'query'; result: QueryResultV1 }
  | { kind: 'feed'; result: FeedProposalV1; applyAllowed: true }
  | { kind: 'feed-unsupported'; code: 'FEED_UNSUPPORTED_LIKES' | 'FEED_UNSUPPORTED_REACH' | 'FEED_SPECS_INVALID' };

export type PubchiBindingWriteParams = {
  owner: Pubky;
  bot: Pubky;
};

export type PubchiBindingRecordResult = OwnerBindingV1;
