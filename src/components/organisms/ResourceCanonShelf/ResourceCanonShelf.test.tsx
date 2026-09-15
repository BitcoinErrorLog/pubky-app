import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toast } from '@/molecules/Toaster/toast';
import { ResourceCanonShelf } from './ResourceCanonShelf';

vi.mock('@/controllers/resource/resource', () => ({
  ResourceController: {
    fetchByTag: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/molecules/Toaster/toast', () => ({
  toast: vi.fn(),
}));

describe('ResourceCanonShelf', () => {
  it('renders all canonical sections', () => {
    render(<ResourceCanonShelf />);

    expect(screen.getByRole('heading', { name: 'Bitcoin Improvement Proposals' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Research' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bitcoin Optech' })).toBeInTheDocument();
  });

  it('shows an error toast when a canonical fetch fails', async () => {
    const { ResourceController } = await import('@/controllers/resource/resource');
    vi.mocked(ResourceController.fetchByTag).mockRejectedValueOnce(new Error('request failed'));

    render(<ResourceCanonShelf />);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: 'error', description: 'Could not load canonical resources.' }),
    );
  });
});
