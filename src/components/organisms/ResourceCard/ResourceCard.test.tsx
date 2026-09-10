import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResourceCard } from './ResourceCard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({
    metadata: {
      title: 'Bitcoin resources',
      description: 'A useful page',
      image: null,
    },
  }),
}));

const resource = {
  details: {
    id: 'resource-1',
    uri: 'https://example.com/bitcoin',
    scheme: 'https',
    indexed_at: 1_700_000_000,
  },
  tags: [
    {
      label: 'bitcoin',
      taggers: ['ui8nw8s9do7u9k9qts4cbup9ry6agz3wxmr734ddhk6jb6zcubso'],
      taggers_count: 1,
      relationship: false,
    },
  ],
};

describe('ResourceCard', () => {
  it('renders the web-page variant and Jeb attribution', () => {
    render(<ResourceCard resource={resource} />);

    expect(screen.getByText('Bitcoin resources')).toBeInTheDocument();
    expect(screen.getByLabelText('Suggested by Jeb')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open original/i })).toHaveAttribute('href', 'https://example.com/bitcoin');
  });

  it('omits Jeb attribution when no pilot tagger is present', () => {
    render(
      <ResourceCard
        resource={{
          ...resource,
          tags: [{ ...resource.tags[0], taggers: ['pk1other'] }],
        }}
      />,
    );

    expect(screen.queryByLabelText('Suggested by Jeb')).not.toBeInTheDocument();
  });
});
