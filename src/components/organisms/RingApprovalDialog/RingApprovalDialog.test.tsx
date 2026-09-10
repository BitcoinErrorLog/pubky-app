import type { Session } from '@synonymdev/pubky';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { PUBCHI_SIGNIN_CAPABILITIES } from '@/libs/pubchi/capabilities';
import { RingApprovalDialog } from './RingApprovalDialog';

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    getCapabilityApprovalUrl: vi.fn(),
  },
}));

describe('RingApprovalDialog', () => {
  beforeEach(() => {
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockReset();
  });

  it('renders the Pubchi capabilities QR and completes approval', async () => {
    let resolveApproval!: (session: Session) => void;
    const approval = new Promise<Session>((resolve) => {
      resolveApproval = resolve;
    });
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockResolvedValue({
      authorizationUrl: 'pubkyauth://approve?token=pubchi',
      awaitApproval: approval,
      cancelAuthFlow: vi.fn(),
    });
    const onApproved = vi.fn();

    render(<RingApprovalDialog open onOpenChange={vi.fn()} onApproved={onApproved} />);

    await waitFor(() => {
      expect(screen.getAllByRole('img')[0]).toBeInTheDocument();
      expect(screen.getByText(PUBCHI_SIGNIN_CAPABILITIES)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Open in Pubky Ring' })).toHaveAttribute(
        'href',
        'pubkyauth://approve?token=pubchi',
      );
    });

    const session = { pubky: 'owner' } as unknown as Session;
    resolveApproval(session);
    await waitFor(() => expect(onApproved).toHaveBeenCalledWith(session));
  });

  it('shows timeout copy when Ring approval expires', async () => {
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockResolvedValue({
      authorizationUrl: 'pubkyauth://approve?token=expired',
      awaitApproval: Promise.reject(new Error('timeout')),
      cancelAuthFlow: vi.fn(),
    });

    render(<RingApprovalDialog open onOpenChange={vi.fn()} onApproved={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Ring request timed out/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Generate a new request/i })).toBeInTheDocument();
    });
  });
});
