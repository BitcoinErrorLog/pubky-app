import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PUBCHI_BRAIN_PANEL_SURFACE, PubchiBrainPanel } from './PubchiBrainPanel';

const hosted = {
  execution: 'synonym-hosted' as const,
  provider_id: 'moonshot' as const,
  model_id: 'kimi-k3' as const,
  endpoint: null,
};

describe('PubchiBrainPanel', () => {
  it('selects the hosted default and shows the identity copy', () => {
    render(<PubchiBrainPanel value={hosted} onChange={vi.fn()} />);

    expect(screen.getByTestId(PUBCHI_BRAIN_PANEL_SURFACE)).toHaveAttribute('data-surface', PUBCHI_BRAIN_PANEL_SURFACE);
    expect(screen.getByLabelText('Pubchi brain')).toBeInTheDocument();
    expect(screen.getByLabelText('Kimi K3, hosted by Synonym (default)')).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByText(
        "Your Pubchi's identity, settings, and history live on your homeserver. Changing the brain changes how it thinks, not who it is.",
      ),
    ).toBeInTheDocument();
  });

  it('reveals self-hosted fields when selected', () => {
    const onChange = vi.fn();
    render(<PubchiBrainPanel value={hosted} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('My own endpoint'));

    expect(screen.getByLabelText('Endpoint URL')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'https://example.com/v1' } });
    fireEvent.change(screen.getByLabelText('Model ID'), { target: { value: 'local-model' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onChange).toHaveBeenCalledWith({
      execution: 'self-hosted',
      provider_id: 'openai-compatible',
      model_id: 'local-model',
      endpoint: 'https://example.com/v1',
    });
  });

  it('switches back to hosted and hides self-hosted fields', () => {
    const onChange = vi.fn();
    render(
      <PubchiBrainPanel
        value={{
          execution: 'self-hosted',
          provider_id: 'openai-compatible',
          model_id: 'local-model',
          endpoint: 'https://example.com/v1',
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Kimi K3, hosted by Synonym (default)'));
    expect(screen.queryByLabelText('Endpoint URL')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(hosted);
  });

  it('rejects credentials in endpoint URLs with the exact warning', () => {
    const onChange = vi.fn();
    render(
      <PubchiBrainPanel
        value={{
          execution: 'self-hosted',
          provider_id: 'openai-compatible',
          model_id: 'kimi-k3',
          endpoint: 'https://example.com',
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'https://user:pass@example.com/v1' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Endpoint URL')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Never put an API key in this URL. Keys stay on your own machine.')).toBeInTheDocument();
  });

  it('shows rollback when a previous brain is provided', () => {
    const onRollback = vi.fn();
    render(
      <PubchiBrainPanel
        value={hosted}
        previous={{
          execution: 'self-hosted',
          provider_id: 'ollama',
          model_id: 'local',
          endpoint: 'https://example.com',
        }}
        onChange={vi.fn()}
        onRollback={onRollback}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Roll back to previous brain' }));
    expect(onRollback).toHaveBeenCalledOnce();
  });
});
