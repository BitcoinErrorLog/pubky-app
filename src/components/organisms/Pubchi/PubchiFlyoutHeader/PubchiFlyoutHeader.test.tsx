import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PubchiFlyoutHeader } from './PubchiFlyoutHeader';

const pubchi = {
  bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
  displayName: 'Scout',
  verified: true,
};

describe('PubchiFlyoutHeader', () => {
  it('re-renders the updated display name without remounting', () => {
    const { rerender } = render(<PubchiFlyoutHeader pubchi={pubchi} />);

    expect(screen.getByText('Scout')).toBeInTheDocument();
    rerender(<PubchiFlyoutHeader pubchi={{ ...pubchi, displayName: 'Scout III' }} />);

    expect(screen.queryByText('Scout')).not.toBeInTheDocument();
    expect(screen.getByText('Scout III')).toBeInTheDocument();
  });

  it('links the profile flyout action to the brain editor', () => {
    render(<PubchiFlyoutHeader pubchi={pubchi} />);

    expect(screen.getByRole('link', { name: /edit brain/i })).toHaveAttribute('href', '/pubchi/brain');
  });
});
