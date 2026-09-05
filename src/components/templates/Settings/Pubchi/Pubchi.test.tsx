import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PUBCHI_SETTINGS_SURFACE, PubchiSettings } from './Pubchi';

vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => ({
    form: { control: {} },
    submit: vi.fn(),
    remove: vi.fn(),
    binding: undefined,
    loading: false,
    enabled: true,
  }),
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: () => true,
}));

vi.mock('@/molecules/ControlledInputField/ControlledInputField', () => ({
  ControlledInputField: () => <input data-testid="pubchi-bot-field" />,
}));

describe('PubchiSettings', () => {
  it('mounts the production settings surface', () => {
    render(<PubchiSettings />);
    expect(screen.getByTestId(PUBCHI_SETTINGS_SURFACE)).toHaveAttribute('data-surface', PUBCHI_SETTINGS_SURFACE);
    expect(screen.getByText('Pubchi')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-enroll-bot')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-not-enrolled')).toHaveTextContent('not enrolled');
  });
});
