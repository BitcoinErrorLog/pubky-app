import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBCHI_SETTINGS_SURFACE, PubchiSettings } from './Pubchi';

const hookState = vi.hoisted(() => ({
  form: { control: {} },
  submit: vi.fn(),
  remove: vi.fn(),
  revokeDevice: vi.fn(),
  revokeAllDevices: vi.fn(),
  reapprove: vi.fn(),
  needsReapproval: false,
  binding: undefined,
  devices: [],
  currentSigner: undefined,
  loading: false,
  enabled: true,
}));

vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => hookState,
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: () => true,
}));

vi.mock('@/molecules/ControlledInputField/ControlledInputField', () => ({
  ControlledInputField: () => <input data-testid="pubchi-bot-field" />,
}));

describe('PubchiSettings', () => {
  beforeEach(() => {
    hookState.needsReapproval = false;
    hookState.reapprove.mockReset();
  });

  it('mounts the production settings surface', () => {
    render(<PubchiSettings />);
    expect(screen.getByTestId(PUBCHI_SETTINGS_SURFACE)).toHaveAttribute('data-surface', PUBCHI_SETTINGS_SURFACE);
    expect(screen.getByText('Pubchi')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-enroll-bot')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-not-enrolled')).toHaveTextContent('not enrolled');
  });

  it('shows the persistent degraded state and disables enrollment until reapproval', () => {
    hookState.needsReapproval = true;

    render(<PubchiSettings />);

    expect(screen.getByTestId('pubchi-degraded-session')).toHaveTextContent(
      "This session can't manage Pubchi. Re-approve with the Pubchi folder to restore revocation.",
    );
    expect(screen.getByTestId('pubchi-enroll-bot')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve' }));
    expect(hookState.reapprove).toHaveBeenCalledOnce();
  });
});
