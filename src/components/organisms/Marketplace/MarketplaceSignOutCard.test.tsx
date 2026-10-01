import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceSignOutCard } from './MarketplaceSignOutCard';

const signOut = vi.hoisted(() => ({ handleSignOut: vi.fn(), isLoading: false }));

vi.mock('@/hooks/useSignOut/useSignOut', () => ({
  useSignOut: () => signOut,
}));

describe('MarketplaceSignOutCard', () => {
  beforeEach(() => {
    signOut.handleSignOut.mockReset();
    signOut.isLoading = false;
  });

  it('signs out through the shared sign-out flow', () => {
    render(<MarketplaceSignOutCard />);

    expect(screen.getByRole('heading', { name: 'Sign out from Pubky' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(signOut.handleSignOut).toHaveBeenCalledTimes(1);
  });

  it('disables the button while signing out', () => {
    signOut.isLoading = true;
    render(<MarketplaceSignOutCard />);

    expect(screen.getByRole('button', { name: 'Signing out...' })).toBeDisabled();
  });
});
