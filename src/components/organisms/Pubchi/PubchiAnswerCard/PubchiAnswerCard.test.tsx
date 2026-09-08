import { render, screen } from '@testing-library/react';
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
  });

  it('renders an honest empty state for an answer without evidence', () => {
    render(<PubchiAnswerCard answer={{ ...answer, evidence: [], summary: '' }} currentUserPubky={owner} />);
    expect(screen.getByText('No evidence was found for this question.')).toBeInTheDocument();
  });
});
