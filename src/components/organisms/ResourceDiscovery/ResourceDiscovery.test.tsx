import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceController } from '@/controllers/resource/resource';
import { ClientErrorCode, NetworkErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { NexusResource } from '@/services/nexus/resource/resource.types';
import { ResourceDiscovery } from './ResourceDiscovery';

vi.mock('@/controllers/resource/resource', () => ({
  ResourceController: {
    fetchByTag: vi.fn(),
    fetchById: vi.fn(),
    fetchByUri: vi.fn(),
  },
}));

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

function resourceWithLabels(id: string, uri: string, labels: string[]): NexusResource {
  return {
    details: { id, uri, scheme: uri.split(':')[0] ?? '', indexed_at: 1 },
    tags: labels.map((label) => ({ label, taggers: [], taggers_count: 1, relationship: false })),
    taggers_count: labels.length,
  };
}

describe('ResourceDiscovery', () => {
  beforeEach(() => {
    vi.mocked(ResourceController.fetchByTag).mockReset();
    vi.mocked(ResourceController.fetchById).mockReset();
    vi.mocked(ResourceController.fetchByUri).mockReset();
  });

  it('renders the production loading skeleton', () => {
    vi.mocked(ResourceController.fetchByTag).mockReturnValue(new Promise(() => {}));

    render(<ResourceDiscovery tag="docs" />);

    expect(screen.getByTestId('resource-discovery-skeleton')).toBeInTheDocument();
  });

  it('renders two tagged resources with safe hrefs', async () => {
    vi.mocked(ResourceController.fetchByTag).mockResolvedValueOnce([
      taggedResource('resource-1', 'https://example.com/one'),
      taggedResource('resource-2', 'https://example.com/two'),
    ]);

    const { container } = render(<ResourceDiscovery tag="docs" />);

    await waitFor(() => expect(container.querySelectorAll('[data-surface="resource-card"]')).toHaveLength(2));
    expect(screen.getAllByRole('link', { name: /open resource/i }).map((link) => link.getAttribute('href'))).toEqual([
      'https://example.com/one',
      'https://example.com/two',
    ]);
  });

  it('renders all ten labels on a resource card', async () => {
    const labels = Array.from({ length: 10 }, (_, index) => `label-${index + 1}`);
    vi.mocked(ResourceController.fetchByTag).mockResolvedValueOnce([
      resourceWithLabels('resource-10-labels', 'https://example.com/labels', labels),
    ]);

    render(<ResourceDiscovery tag="docs" />);

    await waitFor(() => expect(screen.getByText(labels.join(', '))).toBeInTheDocument());
  });

  it('renders the empty stream state', async () => {
    vi.mocked(ResourceController.fetchByTag).mockResolvedValueOnce([]);

    render(<ResourceDiscovery tag="docs" />);

    expect(await screen.findByText('No resources yet')).toBeInTheDocument();
  });

  it('renders not found when by-uri returns 404', async () => {
    vi.mocked(ResourceController.fetchByUri).mockRejectedValueOnce(
      Err.client(ClientErrorCode.NOT_FOUND, 'Not Found', {
        service: ErrorService.Nexus,
        operation: 'fetchNexus',
      }),
    );

    render(<ResourceDiscovery id="https://example.com/missing" />);

    expect(await screen.findByText('Resource not found')).toBeInTheDocument();
  });

  it('renders an error state when the fetch fails', async () => {
    vi.useFakeTimers();
    vi.mocked(ResourceController.fetchByTag).mockRejectedValueOnce(
      Err.network(NetworkErrorCode.CONNECTION_FAILED, 'offline', {
        service: ErrorService.Nexus,
        operation: 'fetchNexus',
      }),
    );

    const { container } = render(<ResourceDiscovery tag="docs" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Unable to load resources')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    vi.useRealTimers();
  });

  it('does not render a javascript: href from a tagged resource', async () => {
    vi.mocked(ResourceController.fetchByTag).mockResolvedValueOnce([
      taggedResource('resource-js', 'javascript:alert(1)'),
    ]);

    const { container } = render(<ResourceDiscovery tag="docs" />);

    expect(await screen.findByText('Unsupported link')).toBeInTheDocument();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('does not render a data: href from a tagged resource', async () => {
    vi.mocked(ResourceController.fetchByTag).mockResolvedValueOnce([
      taggedResource('resource-data', 'data:text/html,hi'),
    ]);

    const { container } = render(<ResourceDiscovery tag="docs" />);

    expect(await screen.findByText('Unsupported link')).toBeInTheDocument();
    expect(container.querySelector('a[href^="data"]')).toBeNull();
  });
});
