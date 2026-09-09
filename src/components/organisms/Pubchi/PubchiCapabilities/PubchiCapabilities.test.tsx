import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PubchiCapabilities } from './PubchiCapabilities';

describe('PubchiCapabilities', () => {
  it('submits the canonical question for most followed users', () => {
    const onSelect = vi.fn();
    render(<PubchiCapabilities tier="read-only" onSelect={onSelect} onBuildFeed={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Most followed users' }));

    expect(onSelect).toHaveBeenCalledWith('Who are the most followed users on Pubky?', 'ask');
  });

  it('renders autonomous capabilities as disabled-looking non-controls', () => {
    render(<PubchiCapabilities tier="read-only" onSelect={() => {}} onBuildFeed={() => {}} />);

    expect(screen.getByTestId('pubchi-capabilities')).toHaveTextContent('not in this version');
    expect(screen.getByText('Posting, replying, and proactive digests — not in this version.')).not.toHaveAttribute(
      'href',
    );
  });
});
