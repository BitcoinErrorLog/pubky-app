import type { RequestObjectV1 } from '@/libs/pubchi/schemas';

export type PubchiQueryBody = {
  question: string;
};

export type PubchiQueryRequest = {
  request: RequestObjectV1;
  body: PubchiQueryBody;
};
