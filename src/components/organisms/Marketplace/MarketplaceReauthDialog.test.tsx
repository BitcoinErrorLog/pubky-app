import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CAPABILITIES } from '@/config/app';
import type { UseStepUpReauthReturn } from '@/hooks/useStepUpReauth/useStepUpReauth.types';
import { MarketplaceReauthDialog } from './MarketplaceReauthDialog';

const reauth: UseStepUpReauthReturn = {
  status: 'idle',
  authorizationUrl: '',
  errorMessage: null,
  start: vi.fn(),
  cancel: vi.fn(),
  copyAuthUrl: vi.fn(),
  openInRing: vi.fn(),
  isOpeningRing: false,
};

vi.mock('@/hooks/useStepUpReauth/useStepUpReauth', () => ({
  useStepUpReauth: () => reauth,
}));

describe('MarketplaceReauthDialog', () => {
  it('asks for a sign-in in product language and does not print capability paths', async () => {
    render(<MarketplaceReauthDialog triggerLabel="Sign in again" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in again' }));

    expect(screen.getByRole('heading', { name: 'Sign in again' })).toBeInTheDocument();
    expect(screen.getByText('Sign in again for this device.')).toBeInTheDocument();
    expect(screen.queryByText(CAPABILITIES)).not.toBeInTheDocument();
    expect(screen.queryByText(/compare it before approving/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/permission list/i)).not.toBeInTheDocument();
  });
});
