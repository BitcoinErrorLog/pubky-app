import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PUBCHI_PANEL_SURFACE, PubchiPanel } from './PubchiPanel';

const submit = vi.fn();
const applyFeed = vi.fn();
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
  signingAvailable: true,
    signingUnavailableMessage: "This browser isn't set up for Pubchi yet. Set it up to start asking.",
};

vi.mock('@/hooks/usePubchiQuery/usePubchiQuery', () => ({
  usePubchiQuery: () => hookState,
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
    hookState.signingAvailable = true;
  });
});
