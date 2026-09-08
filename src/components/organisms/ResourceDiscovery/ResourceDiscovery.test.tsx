import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode, NetworkErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
import type { NexusResource } from '@/services/nexus/resource/resource.types';
import { ResourceDiscovery } from './ResourceDiscovery';

vi.mock('@/services/nexus/nexus.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/nexus/nexus.utils')>();
  return {
    ...actual,
    queryNexus: vi.fn(),
  };
});

vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: (url: string) => ({
    metadata: { url, title: 'Preview', image: null, type: 'website' },
    isLoading: false,
    error: null,
  }),
}));

function taggedResource(id: string, uri: string): NexusResource {
  return {
    details: { id, uri, scheme: uri.split(':')[0] ?? '', indexed_at: 1 },
    tags: [{ label: 'docs', taggers: [], taggers_count: 1, relationship: false }],
    taggers_count: 1,
  };
}

describe('ResourceDiscovery', () => {
  beforeEach(() => {
    vi.mocked(queryNexus).mockReset();
  });

  it('renders the production loading skeleton', () => {
    vi.mocked(queryNexus).mockReturnValue(new Promise(() => {}));

    render(<ResourceDiscovery tag="docs" />);

    expect(screen.getByTestId('resource-discovery-skeleton')).toBeInTheDocument();
  });

  it('renders two tagged resources with safe hrefs', async () => {
    vi.mocked(queryNexus).mockResolvedValueOnce([
      taggedResource('resource-1', 'https://example.com/one'),
      taggedResource('resource-2', 'https://example.com/two'),
    ]);

    const { container } = render(<ResourceDiscovery tag="docs" />);

    await waitFor(() => expect(container.querySelectorAll('[data-surface="resource-card"]')).toHaveLength(2));
    expect(vi.mocked(queryNexus).mock.calls[0]?.[0].url).toContain('v0/stream/resources?tags=');
    expect(screen.getAllByRole('link', { name: /open resource/i }).map((link) => link.getAttribute('href'))).toEqual([
      'https://example.com/one',
      'https://example.com/two',
    ]);
  });

  it('renders the empty stream state', async () => {
    vi.mocked(queryNexus).mockResolvedValueOnce([]);

    render(<ResourceDiscovery tag="docs" />);

    expect(await screen.findByText('No resources yet')).toBeInTheDocument();
    expect(vi.mocked(queryNexus).mock.calls[0]?.[0].url).toContain('v0/stream/resources?tags=');
  });

  it('renders not found when by-uri returns 404', async () => {
    vi.mocked(queryNexus).mockRejectedValueOnce(
      Err.client(ClientErrorCode.NOT_FOUND, 'Not Found', {
        service: ErrorService.Nexus,
        operation: 'fetchNexus',
      }),
    );

    render(<ResourceDiscovery id="https://example.com/missing" />);

    expect(await screen.findByText('Resource not found')).toBeInTheDocument();
    expect(vi.mocked(queryNexus).mock.calls[0]?.[0].url).toContain('v0/resource/by-uri?uri=');
  });

  it('renders an error state when the fetch fails', async () => {
    vi.mocked(queryNexus).mockRejectedValueOnce(
      Err.network(NetworkErrorCode.CONNECTION_FAILED, 'offline', {
        service: ErrorService.Nexus,
        operation: 'fetchNexus',
      }),
    );

    render(<ResourceDiscovery tag="docs" />);

    expect(await screen.findByText('Unable to load resources')).toBeInTheDocument();
  });

  it('does not render a javascript: href from a tagged resource', async () => {
    vi.mocked(queryNexus).mockResolvedValueOnce([taggedResource('resource-js', 'javascript:alert(1)')]);

    const { container } = render(<ResourceDiscovery tag="docs" />);

    expect(await screen.findByText('Unsupported link')).toBeInTheDocument();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('does not render a data: href from a tagged resource', async () => {
    vi.mocked(queryNexus).mockResolvedValueOnce([taggedResource('resource-data', 'data:text/html,hi')]);

    const { container } = render(<ResourceDiscovery tag="docs" />);

    expect(await screen.findByText('Unsupported link')).toBeInTheDocument();
    expect(container.querySelector('a[href^="data"]')).toBeNull();
  });
});
