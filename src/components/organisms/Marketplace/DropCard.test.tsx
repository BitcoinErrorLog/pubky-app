import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NexusDropStreamEntry } from '@/hooks/useMarketplaceDrops/drops-stream';
import { DropCard } from './DropCard';

vi.mock('@/hooks/useMarketplaceMediaUrl/useMarketplaceMediaUrl', () => ({
  useMarketplaceFirstMediaUrl: () => null,
}));

vi.mock('./DropCountdown', () => ({
  DropCountdown: () => <span>Starts in 2 hours</span>,
}));

const entry: NexusDropStreamEntry = {
  id: 'drop-1',
  owner_id: 'owner-pubky',
  title: 'Limited signed print',
  description: 'A numbered release.',
  media_urls: [],
  format: 'fixed_price',
  starts_at: '2026-09-21T12:00:00.000Z',
  ends_at: '2026-09-22T12:00:00.000Z',
  total_quantity: 50,
  per_buyer_limit: 1,
};

describe('DropCard', () => {
  it('keeps indexed status, countdown, quantity, and authoritative navigation visible', () => {
    render(<DropCard entry={entry} bucket="upcoming" />);

    expect(screen.getByRole('link', { name: 'View Limited signed print' })).toHaveAttribute(
      'href',
      '/marketplace/drop/owner-pubky/drop-1',
    );
    expect(screen.getByText('Upcoming · indexed')).toBeInTheDocument();
    expect(screen.getByText('Starts in 2 hours')).toBeInTheDocument();
    expect(screen.getByText('50 editions')).toBeInTheDocument();
    expect(screen.getByText('Open to confirm service state')).toBeInTheDocument();
  });

  it('renders the live indexed state without a countdown', () => {
    render(<DropCard entry={entry} bucket="live" />);

    expect(screen.getByText('Start time passed · indexed')).toBeInTheDocument();
    expect(screen.queryByText('Starts in 2 hours')).not.toBeInTheDocument();
  });
});
