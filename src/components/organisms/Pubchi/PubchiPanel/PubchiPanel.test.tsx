import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PUBCHI_PANEL_SURFACE, PubchiPanel } from './PubchiPanel';

const submit = vi.fn();
const applyFeed = vi.fn();

vi.mock('@/hooks/usePubchiQuery/usePubchiQuery', () => ({
  usePubchiQuery: () => ({
    form: {
      control: {},
      getValues: () => ({ question: '' }),
      trigger: async () => true,
    },
    submit,
    applyFeed,
    result: undefined,
    errorCode: undefined,
    loading: false,
    enabled: true,
  }),
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
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByTestId(PUBCHI_PANEL_SURFACE)).toHaveAttribute('data-surface', PUBCHI_PANEL_SURFACE);
    expect(screen.getByText('Pubchi')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-ask')).toBeInTheDocument();
  });
});
