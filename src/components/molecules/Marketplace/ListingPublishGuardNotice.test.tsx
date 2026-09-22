import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import { LISTING_PUBLISH_BLOCK_COPY, LISTING_PUBLISH_BLOCK_REASONS } from '@/libs/commerce/listing-publish-guards';
import { ListingPublishGuardNotice } from './ListingPublishGuardNotice';

vi.mock('@/organisms/Marketplace/MarketplaceSessionConnectDialog', () => ({
  MarketplaceSessionConnectDialog: ({ triggerLabel }: { triggerLabel: string }) => (
    <button type="button">{triggerLabel}</button>
  ),
}));

vi.mock('@/organisms/Marketplace/MarketplaceSessionRequiredCard', () => ({
  MarketplaceSessionRequiredCard: () => <div>Approve purchases in Pubky Ring</div>,
}));

describe('ListingPublishGuardNotice', () => {
  it.each(LISTING_PUBLISH_BLOCK_REASONS)('renders %s copy at the action density', (reason) => {
    render(
      <ListingPublishGuardNotice
        reason={reason}
        surface="listing-publish-guard"
        id="listing-publish-guard"
        density="action"
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-surface', 'listing-publish-guard');
    expect(alert).toHaveAttribute('id', 'listing-publish-guard');
    expect(alert).toHaveTextContent(LISTING_PUBLISH_BLOCK_COPY[reason].title);
    expect(alert).toHaveTextContent(LISTING_PUBLISH_BLOCK_COPY[reason].body);
  });

  it('links payment settings for the no-method guard', () => {
    render(<ListingPublishGuardNotice reason="no-method" surface="listing-publish-guard" density="action" />);

    expect(screen.getByRole('link', { name: 'Payment settings' })).toHaveAttribute(
      'href',
      `${MARKETPLACE_ROUTES.SETTINGS}?returnTo=${encodeURIComponent(MARKETPLACE_ROUTES.SELL)}`,
    );
    expect(screen.queryByRole('button', { name: 'Approve in Pubky Ring' })).not.toBeInTheDocument();
  });

  it('uses a compact session control at the action density', () => {
    render(<ListingPublishGuardNotice reason="session" surface="listing-publish-guard" density="action" />);

    expect(screen.getByRole('button', { name: 'Approve in Pubky Ring' })).toBeInTheDocument();
    expect(screen.queryByText('Approve purchases in Pubky Ring')).not.toBeInTheDocument();
  });

  it('keeps the full session card on the page banner', () => {
    render(<ListingPublishGuardNotice reason="unverified" surface="seller-publish-blocked" density="banner" />);

    expect(screen.getByText('Approve purchases in Pubky Ring')).toBeInTheDocument();
  });
});
