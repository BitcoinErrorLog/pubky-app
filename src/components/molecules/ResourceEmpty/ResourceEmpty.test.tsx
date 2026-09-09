import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceEmpty } from './ResourceEmpty';

describe('ResourceEmpty', () => {
  it('renders the empty resource index state', () => {
    render(<ResourceEmpty />);
    expect(screen.getByText('No resources yet')).toBeInTheDocument();
  });

  it('renders the not-found lookup state', () => {
    render(<ResourceEmpty lookup />);
    expect(screen.getByText('No tags yet for this link')).toBeInTheDocument();
  });

  it('renders the error state', () => {
    render(<ResourceEmpty error />);
    expect(screen.getByText('Unable to load resources')).toBeInTheDocument();
  });
});

describe('ResourceEmpty - Snapshots', () => {
  it('matches the empty snapshot', () => {
    const { container } = render(<ResourceEmpty />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the error snapshot', () => {
    const { container } = render(<ResourceEmpty error />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the lookup snapshot', () => {
    const { container } = render(<ResourceEmpty lookup />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
