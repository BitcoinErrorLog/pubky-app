import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PUBCHI_SETTINGS_SURFACE, PubchiSettings } from './Pubchi';

vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => ({
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
    loading: false,
    enabled: true,
  }),
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
  it('mounts the production settings surface', () => {
    render(<PubchiSettings />);
    expect(screen.getByTestId(PUBCHI_SETTINGS_SURFACE)).toHaveAttribute('data-surface', PUBCHI_SETTINGS_SURFACE);
    expect(screen.getByText('Pubchi')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-create')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-not-enrolled')).toHaveTextContent('Create a Pubchi');
    expect(screen.queryByPlaceholderText(/52-character|pubky/i)).not.toBeInTheDocument();
  });
});
