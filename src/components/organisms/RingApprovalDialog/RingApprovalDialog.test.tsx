import type { Session } from '@synonymdev/pubky';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { PUBCHI_SIGNIN_CAPABILITIES } from '@/libs/pubchi/capabilities';
import { asOpaque } from '@/test-utils/type-assertions';
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

    const session = asOpaque<Session>({ pubky: 'owner' });
    resolveApproval(session);
    await waitFor(() => expect(onApproved).toHaveBeenCalledWith(session));
  });

  it('displays and encodes caller-provided capabilities', async () => {
    const capabilities = '/pub/example.app/:rw';
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockResolvedValue({
      authorizationUrl: 'pubkyauth://approve?token=custom',
      awaitApproval: new Promise<Session>(() => {}),
      cancelAuthFlow: vi.fn(),
    });

    render(<RingApprovalDialog open onOpenChange={vi.fn()} onApproved={vi.fn()} capabilities={capabilities} />);

    await waitFor(() => expect(screen.getByText(capabilities)).toBeInTheDocument());
    expect(PubchiController.getCapabilityApprovalUrl).toHaveBeenCalledWith(capabilities);
  });

  it('adopts approval after closing and stays open when adoption fails', async () => {
    let resolveApproval!: (session: Session) => void;
    const approval = new Promise<Session>((resolve) => {
      resolveApproval = resolve;
    });
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockResolvedValue({
      authorizationUrl: 'pubkyauth://approve?token=close',
      awaitApproval: approval,
      cancelAuthFlow: vi.fn(),
    });
    const onApproved = vi.fn().mockRejectedValue(new Error('adoption failed'));
    const onOpenChange = vi.fn();
    const { rerender } = render(<RingApprovalDialog open onOpenChange={onOpenChange} onApproved={onApproved} />);

    await waitFor(() => expect(screen.getByRole('link', { name: 'Open in Pubky Ring' })).toBeInTheDocument());
    rerender(<RingApprovalDialog open={false} onOpenChange={onOpenChange} onApproved={onApproved} />);
    resolveApproval(asOpaque<Session>({ pubky: 'owner' }));

    await waitFor(() => expect(onApproved).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.queryByText(/Could not apply the Ring approval/)).not.toBeInTheDocument();
  });

  it('keeps the dialog open and shows adoption errors', async () => {
    vi.mocked(PubchiController.getCapabilityApprovalUrl).mockResolvedValue({
      authorizationUrl: 'pubkyauth://approve?token=error',
      awaitApproval: Promise.resolve(asOpaque<Session>({ pubky: 'owner' })),
      cancelAuthFlow: vi.fn(),
    });
    const onOpenChange = vi.fn();
    render(
      <RingApprovalDialog
        open
        onOpenChange={onOpenChange}
        onApproved={vi.fn().mockRejectedValue(new Error('adoption failed'))}
      />,
    );

    expect(await screen.findByText(/Could not apply the Ring approval/)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
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
