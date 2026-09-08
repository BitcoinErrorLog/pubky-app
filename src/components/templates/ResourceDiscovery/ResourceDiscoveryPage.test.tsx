import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ResourceDiscoveryPage } from './ResourceDiscoveryPage';

vi.mock('@/organisms/ResourceDiscovery/ResourceDiscovery', () => ({
  ResourceDiscovery: ({ tag }: { tag?: string }) => <div>Resources tagged {tag}</div>,
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

describe('ResourceDiscoveryPage', () => {
  it('mounts the resource discovery organism', () => {
    render(<ResourceDiscoveryPage tag="docs" />);

    expect(screen.getByText('Resources tagged docs')).toBeInTheDocument();
  });
});
