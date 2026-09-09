import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBCHI_PANEL_SURFACE, PubchiPanel } from './PubchiPanel';

const submit = vi.fn();
const applyFeed = vi.fn();
const reapprove = vi.fn();
const setupDevice = vi.fn();
const hookState = {
  form: {
    control: {},
    getValues: () => ({ question: '' }),
    watch: () => '',
    trigger: async () => true,
  },
  submit,
  applyFeed,
  result: undefined,
  errorCode: undefined,
  loading: false,
  enabled: true,
  pubchiAvailable: true as boolean | undefined,
  signingAvailable: true,
  signingUnavailableMessage: "This browser isn't set up for Pubchi yet. Set it up to start asking.",
  setupDevice,
  setupLoading: false,
};
const enrollmentState = {
  needsReapproval: false,
  reapprove,
  loading: false,
};

vi.mock('@/hooks/usePubchiQuery/usePubchiQuery', () => ({
  usePubchiQuery: () => hookState,
}));

vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => enrollmentState,
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiPanelEnabled: () => true,
  isPubchiEnabled: () => true,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' }),
}));

vi.mock('@/molecules/ControlledTextareaField/ControlledTextareaField', () => ({
  ControlledTextareaField: () => <textarea data-testid="pubchi-question" />,
}));

describe('PubchiPanel', () => {
  beforeEach(() => {
    enrollmentState.needsReapproval = false;
    reapprove.mockReset();
    setupDevice.mockReset();
    hookState.pubchiAvailable = true;
    hookState.setupLoading = false;
  });

  it('mounts the production panel surface', () => {
    hookState.signingAvailable = true;
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByTestId(PUBCHI_PANEL_SURFACE)).toHaveAttribute('data-surface', PUBCHI_PANEL_SURFACE);
    expect(screen.getByText('Pubchi')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-ask')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-build-feed')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-ask')).not.toBeDisabled();
  });

  it('disables Ask and Build feed when signing is unavailable', () => {
    hookState.signingAvailable = false;
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByTestId('pubchi-signing-unavailable')).toHaveTextContent(
      "This browser isn't set up for Pubchi yet. Set it up to start asking.",
    );
    expect(screen.getByTestId('pubchi-ask')).toBeDisabled();
    expect(screen.getByTestId('pubchi-build-feed')).toBeDisabled();
    fireEvent.click(screen.getByTestId('pubchi-setup-device'));
    expect(setupDevice).toHaveBeenCalledOnce();
    hookState.signingAvailable = true;
  });

  it('shows the create prompt when the owner has no Pubchi', () => {
    hookState.pubchiAvailable = false;
    hookState.signingAvailable = false;

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-not-enrolled')).toHaveTextContent('Create a Pubchi in Settings');
    expect(screen.queryByTestId('pubchi-setup-device')).not.toBeInTheDocument();
    hookState.signingAvailable = true;
  });

  it('shows degraded session recovery without disabling read-only asks', () => {
    enrollmentState.needsReapproval = true;

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-degraded-session')).toHaveTextContent(
      "This session can't manage Pubchi. Re-approve with the Pubchi folder to restore revocation.",
    );
    expect(screen.getByTestId('pubchi-ask')).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve' }));
    expect(reapprove).toHaveBeenCalledOnce();
  });
});
