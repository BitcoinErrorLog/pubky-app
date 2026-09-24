import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceInventoryGrantDialog } from './MarketplaceInventoryGrantDialog';
import { MarketplaceMessagingEnablePanel } from './MarketplaceMessagingEnableDialog';

const state = vi.hoisted(() => ({
  isGrantSession: true,
  inventoryStart: vi.fn(),
  messagingStart: vi.fn(),
}));

vi.mock('@/hooks/useIsGrantSession/useIsGrantSession', () => ({
  useIsGrantSession: () => state.isGrantSession,
}));

vi.mock('@/hooks/useMarketplaceInventoryGrantConnect/useMarketplaceInventoryGrantConnect', () => ({
  useMarketplaceInventoryGrantConnect: () => ({
    status: 'awaiting',
    authorizationUrl: 'pubkyauth:///?relay=https%3A%2F%2Frelay.example.com%2Finbox&secret=x',
    errorMessage: null,
    start: state.inventoryStart,
    cancel: vi.fn(),
    copyAuthUrl: vi.fn(async () => {}),
    openInSigner: vi.fn(),
    isOpeningSigner: false,
  }),
}));

vi.mock('@/hooks/useMarketplaceMessagingEnable/useMarketplaceMessagingEnable', () => ({
  useMarketplaceMessagingEnable: () => ({
    status: 'awaiting',
    authorizationUrl: 'pubkyauth:///?relay=https%3A%2F%2Frelay.example.com%2Finbox&secret=y',
    errorMessage: null,
    start: state.messagingStart,
    cancel: vi.fn(),
    copyAuthUrl: vi.fn(async () => {}),
    openInRing: vi.fn(),
    isOpeningRing: false,
  }),
}));

vi.mock('@/atoms/Dialog/Dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('classic Pubky Ring approvals refuse a grant session', () => {
  beforeEach(() => {
    state.isGrantSession = true;
    state.inventoryStart.mockClear();
    state.messagingStart.mockClear();
  });

  it('grant session sees inventory refusal', () => {
    render(<MarketplaceInventoryGrantDialog autoOpen />);

    expect(screen.getByTestId('grant-session-refusal')).toHaveTextContent(
      'Inventory edits need a Pubky Ring sign-in for now.',
    );
    expect(screen.queryByTestId('qr-auth-url')).not.toBeInTheDocument();
    expect(state.inventoryStart).not.toHaveBeenCalled();
  });

  it('inventory copy names Ring only', () => {
    state.isGrantSession = false;
    render(<MarketplaceInventoryGrantDialog autoOpen />);

    expect(
      screen.getByText('Approve this grant in Pubky Ring; it does not replace your purchase session.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Bitkit/)).not.toBeInTheDocument();
    expect(state.inventoryStart).toHaveBeenCalled();
  });

  it('grant session sees messaging refusal without qr', () => {
    render(<MarketplaceMessagingEnablePanel reconnect={false} />);

    expect(screen.getByTestId('grant-session-refusal')).toHaveTextContent(
      'Messages need a Pubky Ring sign-in for now.',
    );
    expect(screen.queryByTestId('qr-auth-url')).not.toBeInTheDocument();
    expect(state.messagingStart).not.toHaveBeenCalled();
  });

  it('cookie session keeps messaging resume path (the paykit-wasm flow still starts)', () => {
    state.isGrantSession = false;
    render(<MarketplaceMessagingEnablePanel reconnect={false} />);

    expect(screen.queryByTestId('grant-session-refusal')).not.toBeInTheDocument();
    expect(state.messagingStart).toHaveBeenCalled();
  });
});
