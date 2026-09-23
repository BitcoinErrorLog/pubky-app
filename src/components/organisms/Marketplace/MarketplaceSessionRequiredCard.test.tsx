import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceSessionRequiredCard } from './MarketplaceSessionRequiredCard';

const view = vi.hoisted(() => ({ isGrantSession: false, grantEnabled: false }));

vi.mock('@/hooks/useIsGrantSession/useIsGrantSession', () => ({
  useIsGrantSession: () => view.isGrantSession,
}));

vi.mock('@/libs/runtime-config/runtime-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/runtime-config/runtime-config')>()),
  getMarketplaceGrantFlowEnabled: () => view.grantEnabled,
}));

vi.mock('./MarketplaceSessionConnectDialog', () => ({
  MarketplaceSessionConnectDialog: ({ triggerLabel }: { triggerLabel: string }) => <button>{triggerLabel}</button>,
}));

describe('MarketplaceSessionRequiredCard', () => {
  beforeEach(() => {
    view.isGrantSession = false;
    view.grantEnabled = false;
  });

  it('names Pubky Ring for a Ring sign-in', () => {
    render(<MarketplaceSessionRequiredCard />);

    expect(screen.getByRole('heading', { name: 'Approve purchases in Pubky Ring' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve in Pubky Ring' })).toBeInTheDocument();
  });

  it('names Bitkit for a Bitkit sign-in that can bootstrap', () => {
    view.isGrantSession = true;
    view.grantEnabled = true;
    render(<MarketplaceSessionRequiredCard />);

    expect(screen.getByRole('heading', { name: 'Approve purchases in Bitkit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve in Bitkit' })).toBeInTheDocument();
  });

  it('keeps Pubky Ring copy for a Bitkit sign-in when the grant flow is off', () => {
    view.isGrantSession = true;
    render(<MarketplaceSessionRequiredCard />);

    expect(screen.getByRole('heading', { name: 'Approve purchases in Pubky Ring' })).toBeInTheDocument();
  });
});
