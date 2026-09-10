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

  it('groups service C3 sections before unsectioned evidence', () => {
    const c3Answer: PubchiAnswerV1 = {
      ...answer,
      tool_trace_summary: { tools: ['what_did_i_miss'], call_count: 1, truncated: true },
      continuation: {
        since: '2026-09-10T06:00:00Z',
        until: '2026-09-10T07:00:00Z',
        complete: false,
        skipped: 2,
      },
      evidence: [
        { ...answer.evidence[0], kind: 'post', label: 'Followed post', section: 'followed_posts' },
        { ...answer.evidence[0], kind: 'post', label: 'Reply', section: 'replies_to_you' },
        { ...answer.evidence[0], kind: 'tag', label: 'bitcoin', section: 'tags_on_you' },
        { ...answer.evidence[0], kind: 'claim', label: 'Unsectioned claim' },
      ],
    };

    render(<PubchiAnswerCard answer={c3Answer} currentUserPubky={owner} />);

    expect(screen.getByTestId('pubchi-evidence-section-followed_posts')).toHaveTextContent(
      'Posts from people you follow (1)',
    );
    expect(screen.getByTestId('pubchi-evidence-section-replies_to_you')).toHaveTextContent('Replies to you (1)');
    expect(screen.getByTestId('pubchi-evidence-section-tags_on_you')).toHaveTextContent('Tags on you (1)');
    expect(screen.getByTestId('pubchi-evidence-section-claim')).toHaveTextContent('claims (1)');
    expect(screen.getAllByText('and 2 more')).toHaveLength(3);
  });

  it.each([
    [['nexus_influencer'], 'Followers'],
    [['rank_users'], 'Followers'],
    [['rank_tags_recv'], 'Tags received'],
    [['rank_tags_apply'], 'Tags applied'],
    [['nexus_user_tags'], 'Tagged by'],
    [['get_tag_landscape'], 'Tagged by'],
    [['tag_landscape'], 'Tagged by'],
    [['top_posts'], 'Replies'],
    [['recommend_follows'], 'Count'],
    [['recommend'], 'Count'],
    [['stale_follows'], 'Count'],
    [['unknown_route'], 'Claimants'],
  ])('labels %s counts as %s', (tools, label) => {
    render(
      <PubchiAnswerCard
        answer={{ ...answer, tool_trace_summary: { ...answer.tool_trace_summary, tools } } as PubchiAnswerV1}
      />,
    );
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

  it('renders the service-provided scope line for an owner network', () => {
    render(
      <PubchiAnswerCard
        answer={{
          ...answer,
          scope: {
            time: {
              since_ms: Date.parse('2026-09-03T00:00:00Z'),
              until_ms: Date.parse('2026-09-10T00:00:00Z'),
              label: 'last 7 days',
              source: 'default',
            },
            graph: { kind: 'owner_network', hops: 2 },
            filters: [],
            complete: true,
          },
        }}
      />,
    );
    expect(screen.getByTestId('pubchi-answer-scope')).toHaveTextContent(
      'Scope: last 7 days (Sep 3–10 UTC) · your network (2 hops)',
    );
  });

  it('renders no graph lookup without inventing a time scope', () => {
    render(
      <PubchiAnswerCard
        answer={{
          ...answer,
          scope: {
            time: null,
            graph: { kind: 'none' },
            filters: [],
            complete: true,
          },
        }}
      />,
    );
    expect(screen.getByTestId('pubchi-answer-scope')).toHaveTextContent('No graph lookup');
  });

  it('renders nothing when older answers have no scope', () => {
    render(<PubchiAnswerCard answer={answer} />);
    expect(screen.queryByTestId('pubchi-answer-scope')).not.toBeInTheDocument();
  });

  it('renders knowledge provenance and outbound citations', () => {
    render(
      <PubchiAnswerCard
        answer={{
          ...answer,
          basis: 'knowledge',
          summary: 'Pubky uses public homeservers.',
          scope: { time: null, graph: { kind: 'none' }, filters: [], complete: true },
          citations: [
            {
              kind: 'knowledge',
              title: 'Pubky documentation',
              url: 'https://docs.pubky.org/guide',
              snippet: 'Public source',
              corpus_version: '2026-09',
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('From what I know')).toBeInTheDocument();
    expect(screen.queryByTestId('pubchi-answer-scope')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pubky documentation' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Corpus version: 2026-09')).toBeInTheDocument();
  });

  it('renders mixed provenance as graph evidence plus knowledge citations', () => {
    render(
      <PubchiAnswerCard
        answer={{
          ...answer,
          basis: 'mixed',
          citations: [{ kind: 'web', title: 'Current source', url: 'https://example.com/source' }],
          scope: { time: null, graph: { kind: 'whole_graph' }, filters: [], complete: true },
        }}
      />,
    );
    expect(screen.getByText('From what I know')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-answer-scope')).toHaveTextContent('whole graph');
    expect(screen.getByRole('link', { name: 'Current source' })).toBeInTheDocument();
  });
});
