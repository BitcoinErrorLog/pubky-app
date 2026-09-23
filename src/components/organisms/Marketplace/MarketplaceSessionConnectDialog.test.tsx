import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketplaceSessionConnectStatus } from '@/hooks/useMarketplaceSessionConnect/useMarketplaceSessionConnect.types';
import { MarketplaceSessionConnectDialog } from './MarketplaceSessionConnectDialog';

/**
 * Dialog states are driven entirely by the mocked hook: these tests pin WHAT
 * the dialog renders per status — in particular that the joined state (an
 * approval already in progress on another surface) shows honest copy and
 * suppresses the QR slot, Copy, and Open affordances.
 */
const view = vi.hoisted(() => ({
  status: 'joined' as MarketplaceSessionConnectStatus,
  authorizationUrl: '',
  errorMessage: null as string | null,
  isOpeningRing: false,
  requestsFullGrant: true,
  requestsGrantReconnect: false,
  requestsGrantBootstrap: false,
  isGrantSession: false,
  grantEnabled: false,
  start: vi.fn(),
}));
vi.mock('@/libs/runtime-config/runtime-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/runtime-config/runtime-config')>()),
  getMarketplaceGrantFlowEnabled: () => view.grantEnabled,
}));
vi.mock('@/hooks/useIsGrantSession/useIsGrantSession', () => ({
  useIsGrantSession: () => view.isGrantSession,
}));

vi.mock('@/hooks/useMarketplaceSessionConnect/useMarketplaceSessionConnect', () => ({
  useMarketplaceSessionConnect: () => ({
    status: view.status,
    authorizationUrl: view.authorizationUrl,
    errorMessage: view.errorMessage,
    requestsFullGrant: view.requestsFullGrant,
    requestsGrantReconnect: view.requestsGrantReconnect,
    requestsGrantBootstrap: view.requestsGrantBootstrap,
    start: view.start,
    cancel: vi.fn(),
    copyAuthUrl: vi.fn(async () => {}),
    openInRing: vi.fn(),
    isOpeningRing: view.isOpeningRing,
  }),
}));

// Render the dialog content inline (no portal, no trigger click): these tests
// assert the rendered states, not Radix wiring.
vi.mock('@/atoms/Dialog/Dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('MarketplaceSessionConnectDialog', () => {
  beforeEach(() => {
    view.status = 'joined';
    view.authorizationUrl = '';
    view.errorMessage = null;
    view.isOpeningRing = false;
    view.requestsFullGrant = true;
    view.requestsGrantReconnect = false;
    view.requestsGrantBootstrap = false;
    view.isGrantSession = false;
    view.grantEnabled = false;
    view.start.mockClear();
  });

  it('grant session sees refusal not classic qr (grant flow off)', () => {
    view.status = 'awaiting';
    view.authorizationUrl = 'pubkyauth:///?relay=https%3A%2F%2Frelay.example.com%2Finbox&secret=x';
    view.isGrantSession = true;

    render(<MarketplaceSessionConnectDialog autoOpen />);

    expect(screen.getByTestId('grant-session-refusal')).toBeInTheDocument();
    expect(screen.queryByLabelText('Copy authorization link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open in pubky ring/i })).not.toBeInTheDocument();
    expect(view.start).not.toHaveBeenCalled();
  });

  it('grant session connect uses bootstrap (Bitkit copy, no refusal, flow starts)', () => {
    view.status = 'awaiting';
    view.authorizationUrl = 'pubkyauth://signin_grant?caps=%2Fpub%2Fpubky.app%2Fmarketplace-service%2Fv1%2F%3Arw';
    view.isGrantSession = true;
    view.grantEnabled = true;
    view.requestsGrantBootstrap = true;
    view.requestsFullGrant = false;

    render(<MarketplaceSessionConnectDialog autoOpen />);

    expect(view.start).toHaveBeenCalled();
    expect(screen.queryByTestId('grant-session-refusal')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Approve purchases in Bitkit' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Approve with Bitkit to connect purchases for the identity signed in to Shop. Nothing is charged until you pay.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in Bitkit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open in pubky ring/i })).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for approval in Bitkit…')).toBeInTheDocument();
  });

  it('bootstrap creating state confirms with the homeserver', () => {
    view.status = 'creating';
    view.isGrantSession = true;
    view.grantEnabled = true;
    view.requestsGrantBootstrap = true;

    render(<MarketplaceSessionConnectDialog />);

    expect(screen.getByText('Confirming with your homeserver…')).toBeInTheDocument();
  });

  it('a cookie session still starts the classic approval when opened', () => {
    view.status = 'awaiting';
    render(<MarketplaceSessionConnectDialog autoOpen />);

    expect(view.start).toHaveBeenCalled();
    expect(screen.queryByTestId('grant-session-refusal')).not.toBeInTheDocument();
  });

  it('joined state: honest copy, and no QR slot, Copy, or Open affordances', () => {
    render(<MarketplaceSessionConnectDialog />);

    expect(screen.getByText(/approval is already in progress on another surface/i)).toBeInTheDocument();
    // The QR slot button (its aria-label is the copy affordance) must not
    // render — there is no URL on this surface to scan, copy, or open.
    expect(screen.queryByLabelText('Copy authorization link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open in pubky ring/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy link/i })).not.toBeInTheDocument();
  });

  it('awaiting state with a URL still renders the QR slot (contrast)', () => {
    view.status = 'awaiting';
    view.authorizationUrl = 'pubkyauth:///?relay=https%3A%2F%2Frelay.example.com%2Finbox&secret=x';

    render(<MarketplaceSessionConnectDialog />);

    expect(screen.getByLabelText('Copy authorization link')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open in pubky ring/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByText('Sign in to Pubky Shop.')).toBeInTheDocument();
    expect(screen.queryByText(/permission list/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/compare it before approving/i)).not.toBeInTheDocument();
  });

  it('uses reconnect copy only when the hook selected grant reconnect', () => {
    view.requestsGrantReconnect = true;
    view.requestsFullGrant = false;
    render(<MarketplaceSessionConnectDialog />);

    expect(screen.getByRole('heading', { name: 'Approve purchases' })).toBeInTheDocument();
    expect(screen.getByText(/reconnect the marketplace session/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Approve purchases in Pubky Ring' })).not.toBeInTheDocument();
  });
});
