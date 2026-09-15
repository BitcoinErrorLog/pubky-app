import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResourceCard } from './ResourceCard';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
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
  it('formats Nexus millisecond timestamps as UTC dates', () => {
    render(
      <ResourceCard resource={{ ...resource, details: { ...resource.details, indexed_at: 1_788_891_705_406 } }} />,
    );

    expect(
      screen.getByText(new Date(1_788_891_705_406).toLocaleDateString('en-US', { timeZone: 'UTC' })),
    ).toBeInTheDocument();
  });

  it('separates the resource host and indexed date in the meta line', () => {
    render(
      <ResourceCard
        resource={{
          ...resource,
          details: {
            ...resource.details,
            uri: 'https://store.blockstream.com/products/jade-plus',
            indexed_at: 1_788_891_705_406,
          },
        }}
      />,
    );

    expect(screen.getByText('store.blockstream.com').parentElement).toHaveTextContent(
      'store.blockstream.com · 9/8/2026',
    );
  });

  it('renders the web-page variant without suggested-by text', () => {
    render(<ResourceCard resource={resource} />);

    expect(screen.getByText('Bitcoin resources')).toBeInTheDocument();
    expect(screen.getByLabelText('bitcoin tag (1 taggers)')).toBeInTheDocument();
    expect(screen.queryByText(/suggested by/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open original/i })).toHaveAttribute('href', 'https://example.com/bitcoin');
  });

  it('navigates to the public resource tag route when a tag is clicked', () => {
    render(<ResourceCard resource={resource} />);

    fireEvent.click(screen.getByLabelText('bitcoin tag (1 taggers)'));
    expect(push).toHaveBeenCalledWith('/resources/tag/bitcoin');
  });
});
