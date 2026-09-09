import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBCHI_SETTINGS_SURFACE, PubchiSettings, saveBrain } from './Pubchi';

const hookState = vi.hoisted(() => ({
  form: { control: {} },
  backupForm: { control: {} },
  submit: vi.fn(),
  confirmBackup: vi.fn(),
  openBackup: vi.fn(),
  closeBackup: vi.fn(),
  remove: vi.fn(),
  revokeDevice: vi.fn(),
  revokeAllDevices: vi.fn(),
  reapprove: vi.fn(),
  needsReapproval: false,
  binding: undefined,
  pubchi: undefined,
  creating: false,
  backupOpen: false,
  backupPositions: [],
  backupController: { words: () => [] },
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
  ControlledInputField: ({ label, placeholder }: { label: string; placeholder?: string }) => (
    <input aria-label={label} placeholder={placeholder} />
  ),
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
    expect(screen.getByTestId('pubchi-create')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-not-enrolled')).toHaveTextContent('Create a Pubchi');
    expect(screen.queryByPlaceholderText(/52-character|pubky/i)).not.toBeInTheDocument();
  });

  it('shows the persistent degraded state and disables enrollment until reapproval', () => {
    hookState.needsReapproval = true;

    render(<PubchiSettings />);

    expect(screen.getByTestId('pubchi-degraded-session')).toHaveTextContent(
      "This session can't manage Pubchi. Re-approve with the Pubchi folder to restore revocation.",
    );
    expect(screen.getByTestId('pubchi-create')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve' }));
    expect(hookState.reapprove).toHaveBeenCalledOnce();
  });

  it('keeps the default public web context disabled on the first brain save', async () => {
    const saveConfig = vi.fn().mockResolvedValue(undefined);

    await saveBrain(
      {
        execution: 'synonym-hosted',
        provider_id: 'moonshot',
        model_id: 'kimi-k3',
        endpoint: null,
      },
      null,
      saveConfig,
    );

    expect(saveConfig).toHaveBeenCalledWith({
      brain: expect.objectContaining({ send_public_web_context: false }),
    });
  });
});
