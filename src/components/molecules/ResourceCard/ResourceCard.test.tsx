import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getResourceRoute, getResourceTagRoute } from '@/app/routes';
import type { NexusResource } from '@/services/nexus/resource/resource.types';
import { ResourceCard } from './ResourceCard';

vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: (url: string | null) => ({
    metadata: url
      ? {
          url,
          title: 'Example resource',
          description: 'A useful example resource.',
          image: null,
          type: 'website' as const,
        }
      : null,
    isLoading: false,
    error: null,
  }),
}));

function resourceWithUri(uri: string, labels = ['docs']): NexusResource {
  return {
    details: {
      id: 'resource-1',
      uri,
      scheme: uri.split(':')[0] ?? '',
      indexed_at: 1,
    },
    tags: labels.map((label) => ({ label, taggers: [], taggers_count: 1, relationship: false })),
    taggers_count: labels.length,
  };
}

describe('ResourceCard', () => {
  it('renders OG metadata and one external URI action', () => {
    const { container } = render(<ResourceCard resource={resourceWithUri('https://example.com/resource')} />);

    expect(screen.getByRole('heading', { name: 'Example resource' })).toBeInTheDocument();
    expect(screen.getByText('A useful example resource.')).toBeInTheDocument();
    expect(screen.getAllByText('example.com/resource')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'example.com/resource' })).toHaveAttribute(
      'href',
      'https://example.com/resource',
    );
    expect(container.querySelector('[data-surface="resource-card"]')).toBeInTheDocument();
  });

  it('renders a safe http(s) resource as an external anchor', () => {
    render(<ResourceCard resource={resourceWithUri('https://example.com/resource')} />);

    const link = screen.getByRole('link', { name: 'example.com/resource' });
    expect(link).toHaveAttribute('href', 'https://example.com/resource');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('links stream cards to resource details and hints at more tags', () => {
    const resource = resourceWithUri('https://example.com/resource', ['one', 'two', 'three', 'four', 'five']);

    render(<ResourceCard resource={resource} showDetailsLink />);

    expect(screen.getByRole('link', { name: /Example resource/ })).toHaveAttribute(
      'href',
      getResourceRoute(resource.details.id),
    );
    expect(screen.getAllByTestId('tag')[0]).toHaveTextContent('one1');
    expect(screen.getByRole('link', { name: 'example.com/resource' })).toHaveAttribute('href', resource.details.uri);
    expect(screen.getByText('More tags')).toBeInTheDocument();
  });

  it('links each tag chip to the resource tag route', () => {
    render(<ResourceCard resource={resourceWithUri('https://example.com/resource', ['docs'])} />);

    expect(screen.getByRole('link', { name: 'docs 1' })).toHaveAttribute('href', getResourceTagRoute('docs'));
  });

  it('does not hint at more tags below the stream preview limit', () => {
    render(
      <ResourceCard
        resource={resourceWithUri('https://example.com/resource', ['one', 'two', 'three', 'four'])}
        showDetailsLink
      />,
    );

    expect(screen.queryByText('More tags')).not.toBeInTheDocument();
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'vbscript:msgbox(1)'])(
    'does not render an anchor for an unsafe %s uri',
    (uri) => {
      const { container } = render(<ResourceCard resource={resourceWithUri(uri)} />);

      expect(container.querySelector('a[target="_blank"]')).toBeNull();
      expect(screen.getByText(uri)).toBeInTheDocument();
      expect(screen.getByText('Unsupported link')).toBeInTheDocument();
      expect(container.querySelector('a[target="_blank"]')).toBeNull();
    },
  );
});

describe('ResourceCard - Snapshots', () => {
  it('matches the metadata card snapshot', () => {
    const { container } = render(<ResourceCard resource={resourceWithUri('https://example.com/resource')} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the five-tag card snapshot', () => {
    const { container } = render(
      <ResourceCard
        resource={resourceWithUri('https://example.com/resource', ['one', 'two', 'three', 'four', 'five'])}
        showDetailsLink
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
