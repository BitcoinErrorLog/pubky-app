import { PUBCHI_PRIVATE_DIRECTORY, sessionCovers } from '@/libs/pubchi/capabilities';
import type { PubchiAnswerV1 } from '@/libs/pubchi/schemas';
import type { Pubky } from '@/models/models.types';
import type { PubchiDraftPostRecord } from '@/models/pubchi/draft-post.schema';

export const PUBKY_POST_DIRECTORY = '/pub/pubky.app/';
const MAX_APPLICATION_AGE_SECONDS = 600;

export type DraftPostBinding = {
  owner: Pubky;
  bot: Pubky;
  servedPurpose: 'ask';
  question: string;
  response: PubchiAnswerV1;
  submitted_at: number;
  responseRunId: string;
  responseSha256: string;
};

type SessionLike = { info?: { capabilities?: string[] } };

export function draftPostBinding(record: PubchiDraftPostRecord): DraftPostBinding | undefined {
  const response = record.response as PubchiAnswerV1;
  if (response.run_id !== record.response_run_id || response.owner !== record.owner || response.bot !== record.bot)
    return undefined;
  return {
    owner: record.owner,
    bot: record.bot,
    servedPurpose: record.served_purpose,
    question: record.question,
    submitted_at: record.submitted_at,
    responseRunId: record.response_run_id,
    responseSha256: record.response_sha256 ?? '',
    response,
  };
}

function matchesStoredAnswer(binding: DraftPostBinding): boolean {
  const answer = binding.response;
  if (!answer.draft_post) return false;
  if (answer.owner !== binding.owner || answer.bot !== binding.bot) return false;
  if (binding.responseRunId !== answer.run_id || !binding.responseSha256) return false;
  if (answer.purpose !== binding.servedPurpose || answer.question !== binding.question) return false;
  if (answer.section !== 'draft_post' || answer.run_id.length === 0 || !Number.isFinite(binding.submitted_at))
    return false;
  return true;
}

function withinAge(binding: DraftPostBinding, nowSeconds: number): boolean {
  if (Math.abs(nowSeconds - binding.response.generated_at) > MAX_APPLICATION_AGE_SECONDS) return false;
  return Math.abs(Date.now() - binding.submitted_at) <= MAX_APPLICATION_AGE_SECONDS * 1000;
}

export function canPublishDraftPost(
  binding: DraftPostBinding,
  currentSession: SessionLike | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!matchesStoredAnswer(binding) || !withinAge(binding, nowSeconds)) return false;
  const capabilities = currentSession?.info?.capabilities ?? [];
  return sessionCovers(capabilities, PUBKY_POST_DIRECTORY) && sessionCovers(capabilities, PUBCHI_PRIVATE_DIRECTORY);
}

export function canRejectDraftPost(
  binding: DraftPostBinding,
  currentSession: SessionLike | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!matchesStoredAnswer(binding) || !withinAge(binding, nowSeconds)) return false;
  const capabilities = currentSession?.info?.capabilities ?? [];
  return sessionCovers(capabilities, PUBCHI_PRIVATE_DIRECTORY);
}
