import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NexusResource } from '@/services/nexus/resource/resource.types';
import { ResourceCard } from './ResourceCard';

vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({
    metadata: { url: 'https://example.com/resource', title: 'Example resource', image: null, type: 'website' },
    isLoading: false,
    error: null,
  }),
}));

function resourceWithUri(uri: string): NexusResource {
  return {
    details: {
      id: 'resource-1',
      uri,
      scheme: uri.split(':')[0] ?? '',
      indexed_at: 1,
    },
    tags: [{ label: 'docs', taggers: [], taggers_count: 1, relationship: false }],
    taggers_count: 1,
  };
}

describe('ResourceCard', () => {
  it('renders the production resource surface and canonical link', () => {
    const { container } = render(<ResourceCard resource={resourceWithUri('https://example.com/resource')} />);

    expect(screen.getByTestId('generic-website-preview')).toBeInTheDocument();
    expect(screen.getAllByText('https://example.com/resource')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /open resource/i })).toHaveAttribute(
      'href',
      'https://example.com/resource',
    );
    expect(container.querySelector('[data-surface="resource-card"]')).toBeInTheDocument();
  });

  it('renders a safe http(s) resource as an external anchor', () => {
    render(<ResourceCard resource={resourceWithUri('https://example.com/resource')} />);

    const link = screen.getByRole('link', { name: /open resource/i });
    expect(link).toHaveAttribute('href', 'https://example.com/resource');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'vbscript:msgbox(1)'])(
    'does not render an anchor for an unsafe %s uri',
    (uri) => {
      const { container } = render(<ResourceCard resource={resourceWithUri(uri)} />);

      expect(container.querySelector('a')).toBeNull();
      expect(screen.getByText(uri)).toBeInTheDocument();
      expect(screen.getByText('Unsupported link')).toBeInTheDocument();
      expect(screen.queryByTestId('generic-website-preview')).not.toBeInTheDocument();
    },
  );
});
