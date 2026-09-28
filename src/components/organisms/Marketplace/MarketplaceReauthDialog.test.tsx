import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const signIn = vi.hoisted(() => ({ isGrantSession: false }));
vi.mock('@/hooks/useIsGrantSession/useIsGrantSession', () => ({
  useIsGrantSession: () => signIn.isGrantSession,
}));

vi.mock('@/libs/runtime-config/runtime-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/runtime-config/runtime-config')>()),
  getMarketplaceGrantFlowEnabled: () => true,
}));

const RECONNECT_URL =
  'pubkyauth://signin_grant?caps=%2Fpub%2Fpubky.app%2Fmarketplace-service%2Fv1%2F%3Arw%2C%2Fpriv%2Fpubky.app%2F%3Arw&relay=r&secret=s&cid=marketplace.staging.shop.pubky.app&cpk=k';

const connect = vi.hoisted(() => ({
  start: vi.fn(),
  bootstrap: false,
}));
vi.mock('@/hooks/useMarketplaceSessionConnect/useMarketplaceSessionConnect', () => ({
  useMarketplaceSessionConnect: () => ({
    status: 'awaiting',
    authorizationUrl: RECONNECT_URL,
    errorMessage: null,
    requestsFullGrant: false,
    requestsGrantReconnect: !connect.bootstrap,
    requestsGrantBootstrap: connect.bootstrap,
    start: connect.start,
    cancel: vi.fn(),
    copyAuthUrl: vi.fn(async () => {}),
    openInRing: vi.fn(),
    isOpeningRing: false,
  }),
}));

describe('MarketplaceReauthDialog', () => {
  beforeEach(() => {
    vi.mocked(reauth.start).mockClear();
    connect.start.mockClear();
    connect.bootstrap = false;
    signIn.isGrantSession = false;
  });

  it('opening starts a fresh step-up flow and shows its QR', async () => {
    render(<MarketplaceReauthDialog triggerLabel="Sign in again" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in again' }));

    expect(reauth.start).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Copy authorization link')).toBeInTheDocument();
    expect(screen.queryByTestId('grant-session-refusal')).not.toBeInTheDocument();
  });

  it('asks for a sign-in in product language and does not print capability paths', async () => {
    render(<MarketplaceReauthDialog triggerLabel="Sign in again" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in again' }));

    expect(screen.getByRole('heading', { name: 'Sign in again' })).toBeInTheDocument();
    expect(screen.getByText('Sign in again for this device.')).toBeInTheDocument();
    expect(screen.queryByText(CAPABILITIES)).not.toBeInTheDocument();
    expect(screen.queryByText(/compare it before approving/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/permission list/i)).not.toBeInTheDocument();
  });

  it('re-approves a Bitkit sign-in through the marketplace grant any Pubky signer can approve', async () => {
    signIn.isGrantSession = true;
    render(<MarketplaceReauthDialog triggerLabel="Sign in again" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in again' }));

    expect(reauth.start).not.toHaveBeenCalled();
    expect(connect.start).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('grant-session-refusal')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Approve with Bitkit or Pubky Ring to reconnect the marketplace session for the identity already signed in to Shop. Nothing is charged until you pay.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in signer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open in pubky ring/i })).not.toBeInTheDocument();
  });

  it('offers Bitkit to a Bitkit sign-in that has no marketplace session yet', async () => {
    signIn.isGrantSession = true;
    connect.bootstrap = true;
    render(<MarketplaceReauthDialog triggerLabel="Sign in again" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in again' }));

    expect(reauth.start).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Open in Bitkit' })).toBeInTheDocument();
    expect(screen.getByTestId('session-approval-caption')).toHaveTextContent(
      'Bitkit shows this request from marketplace.staging.shop.pubky.app, for marketplace purchases, stock edits, and reading and writing your private Shop data.',
    );
  });
});
