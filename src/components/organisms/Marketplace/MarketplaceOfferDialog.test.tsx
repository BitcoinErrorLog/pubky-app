import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth/auth.store';
import { MarketplaceOfferDialog } from './MarketplaceOfferDialog';

const SIGNED_IN_PUBKY = 'y'.repeat(52);

describe('MarketplaceOfferDialog', () => {
  beforeEach(() => {
    useAuthStore.setState({ currentUserPubky: SIGNED_IN_PUBKY });
  });

  it('disables the trigger while the listing has no server revision to offer against', () => {
    render(<MarketplaceOfferDialog aggregateId="listing:x" expectedRevision={null} onAccepted={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Make offer' })).toBeDisabled();
  });

  it('opens a labelled modal dialog, traps focus in labelled fields, and restores focus on close', async () => {
    const user = userEvent.setup();
    render(<MarketplaceOfferDialog aggregateId="listing:x" expectedRevision={1} onAccepted={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'Make offer' });
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Make a private offer' });
    // every field is reachable by its accessible name
    expect(screen.getByLabelText('Offer amount (USD)')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument();
    expect(screen.getByLabelText('Message (optional)')).toBeInTheDocument();
    // focus starts inside the dialog
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // focus returns to the element that opened the dialog
    expect(document.activeElement).toBe(trigger);
  });

  it('opens the sign-in dialog instead of the offer form for signed-out visitors', async () => {
    useAuthStore.setState({ currentUserPubky: null });
    const user = userEvent.setup();
    render(<MarketplaceOfferDialog aggregateId="listing:x" expectedRevision={1} onAccepted={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Make offer' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useAuthStore.getState().showSignInDialog).toBe(true);
  });
});
