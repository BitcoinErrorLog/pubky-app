import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PUBCHI_BRAIN_EDITOR_SURFACE, PubchiBrainEditor } from './PubchiBrainEditor';

describe('PubchiBrainEditor', () => {
  it('explains private brain context and previews typed rules', () => {
    render(
      <PubchiBrainEditor
        context={{ schema: 'pubchi-owner-context', version: 1, about: 'Bitcoin developer', instructions: 'Two sentences max.', updated_at: 1 }}
        contextEditable
        onSaveContext={vi.fn()}
      />,
    );

    expect(screen.getByTestId(PUBCHI_BRAIN_EDITOR_SURFACE)).toHaveAttribute('data-surface', PUBCHI_BRAIN_EDITOR_SURFACE);
    expect(screen.getByText(/reads these before every answer/)).toBeInTheDocument();
    expect(screen.getByText(/stored in your homeserver's private area/i)).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-brain-preview')).toHaveTextContent('I’ll keep this to two sentences.');
    expect(screen.getByPlaceholderText(/Bitcoin developer in Lisbon/)).toBeInTheDocument();
  });

  it('shows the gate while keeping current values read-only', () => {
    const onReapprove = vi.fn();
    render(
      <PubchiBrainEditor
        context={{ schema: 'pubchi-owner-context', version: 1, about: 'Existing context', instructions: 'Be concise', updated_at: 1 }}
        contextEditable={false}
        onReapprove={onReapprove}
      />,
    );

    expect(screen.getByTestId('pubchi-brain-gate')).toHaveTextContent(/doesn't include the private Pubchi folder/);
    expect(screen.getByLabelText('About you')).toHaveValue('Existing context');
    expect(screen.getByLabelText('About you')).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve in Ring' }));
    expect(onReapprove).toHaveBeenCalledOnce();
  });
});
