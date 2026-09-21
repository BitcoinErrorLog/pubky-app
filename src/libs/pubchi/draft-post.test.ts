import { describe, expect, it, vi } from 'vitest';
import type { PubchiAnswerV1 } from '@/libs/pubchi/schemas';
import { canPublishDraftPost, canRejectDraftPost } from './draft-post';

const owner = '4bfmrcuwfq4ksqoupn6wcfxrh5enr1izdeyszmhfrntuf1mzoh5o';
const bot = 'wnpkm7d4c7caym93kzhpamjkn11hu8jdz4m9o3y1x9huopniwuay';
const evidenceUri = `pubky://${owner}/pub/pubky.app/profile.json`;

const answer: PubchiAnswerV1 = {
  schema: 'pubchi-answer',
  version: 1,
  bot,
  owner,
  generated_at: 1_800_000_000,
  run_id: 'run-1',
  purpose: 'ask',
  question: 'Draft a short post about Pubky',
  summary: 'A short post you can publish as yourself.',
  evidence: [
    {
      kind: 'user',
      label: 'Owner profile',
      uri: evidenceUri,
      claimants: [],
      claimant_count: 0,
      in_your_graph: true,
    },
  ],
  sources: [],
  tool_trace_summary: { tools: [], call_count: 0, truncated: false },
  policy_version: 1,
  section: 'draft_post',
  draft_post: {
    content: 'Pubky keeps public social state on your homeserver.',
    kind: 'short',
    tags: ['pubky-app'],
    rationale: 'Matches the public profile evidence.',
    evidence: [evidenceUri],
  },
};

const binding = {
  owner,
  bot,
  servedPurpose: 'ask' as const,
  question: answer.question,
  submitted_at: 1_800_000_000_000,
  responseRunId: answer.run_id,
  responseSha256: 'b'.repeat(64),
  response: answer,
};

const session = {
  info: { capabilities: ['/pub/pubky.app/:rw', '/priv/app.pubchi/v1/:rw'] },
};

describe('draft post apply binding', () => {
  it('accepts the exact stored response binding with both capability gates', () => {
    vi.setSystemTime(1_800_000_000_000);
    expect(canPublishDraftPost(binding, session, 1_800_000_000)).toBe(true);
    expect(canRejectDraftPost(binding, session, 1_800_000_000)).toBe(true);
    vi.useRealTimers();
  });

  it('rejects answer fields that differ from the stored signed request binding', () => {
    expect(canPublishDraftPost({ ...binding, response: { ...answer, owner: bot } }, session, 1_800_000_000)).toBe(
      false,
    );
    expect(
      canPublishDraftPost({ ...binding, response: { ...answer, question: 'different' } }, session, 1_800_000_000),
    ).toBe(false);
    expect(
      canPublishDraftPost({ ...binding, response: { ...answer, run_id: 'different' } }, session, 1_800_000_000),
    ).toBe(false);
    expect(
      canPublishDraftPost(
        { ...binding, response: { ...answer, section: 'tag_suggestions', draft_post: undefined } },
        session,
        1_800_000_000,
      ),
    ).toBe(false);
  });

  it('rejects either stale service or local age', () => {
    vi.setSystemTime(1_800_000_000_000);
    expect(canPublishDraftPost(binding, session, 1_800_000_601)).toBe(false);
    expect(canPublishDraftPost({ ...binding, submitted_at: 1_800_000_000_000 - 601_000 }, session, 1_800_000_000)).toBe(
      false,
    );
    vi.useRealTimers();
  });

  it('requires public and private capability to publish and only private to reject', () => {
    vi.setSystemTime(1_800_000_000_000);
    expect(canPublishDraftPost(binding, { info: { capabilities: ['/priv/app.pubchi/v1/:rw'] } }, 1_800_000_000)).toBe(
      false,
    );
    expect(canPublishDraftPost(binding, { info: { capabilities: ['/pub/pubky.app/:rw'] } }, 1_800_000_000)).toBe(false);
    expect(canRejectDraftPost(binding, { info: { capabilities: ['/priv/app.pubchi/v1/:rw'] } }, 1_800_000_000)).toBe(
      true,
    );
    expect(canRejectDraftPost(binding, { info: { capabilities: ['/pub/pubky.app/:rw'] } }, 1_800_000_000)).toBe(false);
    vi.useRealTimers();
  });
});
