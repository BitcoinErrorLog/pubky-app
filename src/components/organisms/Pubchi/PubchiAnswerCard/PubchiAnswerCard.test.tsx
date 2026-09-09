import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PubchiAnswerV1 } from '@/libs/pubchi/schemas';
import { PubchiAnswerCard } from './PubchiAnswerCard';

const owner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

const answer: PubchiAnswerV1 = {
  schema: 'pubchi-answer',
  version: 1,
  bot: owner,
  owner,
  generated_at: 1,
  run_id: 'test-answer',
  purpose: 'ask',
  question: 'Who is active?',
  summary: 'Alice is active.',
  evidence: [
    {
      kind: 'user',
      label: 'Alice',
      uri: `pubky://${owner}/pub/pubky.app/profile.json`,
      claimants: [owner],
      claimant_count: 1,
      in_your_graph: true,
    },
  ],
  sources: [],
  tool_trace_summary: { tools: [], call_count: 0, truncated: false },
  policy_version: 1,
};

vi.mock('@/controllers/user/user', () => ({
  UserController: { getOrFetch: vi.fn().mockResolvedValue({ name: 'Alice' }) },
}));

describe('PubchiAnswerCard', () => {
  it('renders evidence before the interpretation label', async () => {
    render(<PubchiAnswerCard answer={answer} currentUserPubky={owner} />);
    expect(screen.getByTestId('pubchi-answer')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText("Pubchi's reading of the evidence")).toBeInTheDocument();
    expect(screen.getByText('In your graph')).toBeInTheDocument();
    expect(screen.getByText('Claimants: 1')).toBeInTheDocument();
  });

  it.each([
    [['nexus_influencer'], 'Followers'],
    [['rank_users'], 'Followers'],
    [['nexus_user_tags'], 'Tagged by'],
    [['get_tag_landscape'], 'Tagged by'],
    [['tag_landscape'], 'Tagged by'],
    [['top_posts'], 'Replies'],
    [['recommend_follows'], 'Count'],
    [['recommend'], 'Count'],
    [['stale_follows'], 'Count'],
    [['unknown_route'], 'Claimants'],
  ])('labels %s counts as %s', (tools, label) => {
    render(<PubchiAnswerCard answer={{ ...answer, tool_trace_summary: { ...answer.tool_trace_summary, tools }} as PubchiAnswerV1} />);
    expect(screen.getByText(`${label}: 1`)).toBeInTheDocument();
  });

  it('shows taggers but not claimant details for user evidence', async () => {
    const tagger = 'a1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
    const tagAnswer = {
      ...answer,
      evidence: [
        { ...answer.evidence[0], kind: 'tag' as const, claimants: [tagger] },
        { ...answer.evidence[0], label: 'Bob', claimants: [owner] },
      ],
      tool_trace_summary: { tools: ['get_tag_landscape'], call_count: 1, truncated: false },
    };
    render(<PubchiAnswerCard answer={tagAnswer} currentUserPubky={owner} />);
    await waitFor(() => expect(screen.getByRole('link', { name: /Alice/ })).toBeInTheDocument());
    expect(screen.queryByText(owner)).not.toBeInTheDocument();
  });

  it('uses the graph heading for deterministic routes', () => {
    render(
      <PubchiAnswerCard
        answer={{ ...answer, tool_trace_summary: { tools: ['top_posts'], call_count: 1, truncated: false } }}
        currentUserPubky={owner}
      />,
    );
    expect(screen.getByText('What the graph shows')).toBeInTheDocument();
    expect(screen.queryByText("Pubchi's reading of the evidence")).not.toBeInTheDocument();
  });

  it('renders an honest empty state for an answer without evidence', () => {
    render(<PubchiAnswerCard answer={{ ...answer, evidence: [], summary: '' }} currentUserPubky={owner} />);
    expect(screen.getByText('No evidence was found for this question.')).toBeInTheDocument();
  });
});
