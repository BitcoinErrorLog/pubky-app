import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMERCE_REVIEW_EDIT_WINDOW_SECONDS } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { CommerceReviewModelSchema } from '@/models/commerce/commerce.schema';
import type { MarketplaceOrder } from '@/services/marketplace/marketplace';
import { createOrderFixture, ORDER_FIXTURE_BUYER } from '@/test/fixtures/commerce/orders';
import { MarketplaceOrderActions } from './MarketplaceOrderActions';

// The component reads two honest projections through the controller: the
// seller's D2 band consent (review dialog) and the local copy of the user's
// own published review record (status line). Both are mocked per scenario.
vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getMarketplaceBandConsent: vi.fn(async () => null),
    getOwnMarketplaceReview: vi.fn(async () => null),
  },
}));

const mockedController = vi.mocked(CommerceController);

beforeEach(() => {
  mockedController.getMarketplaceBandConsent.mockReset().mockResolvedValue(null);
  mockedController.getOwnMarketplaceReview.mockReset().mockResolvedValue(null);
});

const WINDOW_MS = COMMERCE_REVIEW_EDIT_WINDOW_SECONDS * 1000;

function ownReview(createdAt: string): NonNullable<MarketplaceOrder['reviews']>[number] {
  return {
    id: '018f47d2-6a27-7c23-a62f-000000000601',
    reviewerPubky: ORDER_FIXTURE_BUYER,
    subjectPubky: 's'.repeat(52),
    rating: 5,
    text: 'Accurate and fast.',
    createdAt,
  };
}

function renderActions({
  reviewCreatedAt,
  canEditReview = true,
  withOwnReview = true,
}: {
  reviewCreatedAt?: string;
  canEditReview?: boolean;
  withOwnReview?: boolean;
} = {}) {
  const order = createOrderFixture('completed', {
    reviews: withOwnReview ? [ownReview(reviewCreatedAt ?? new Date(Date.now() - 60_000).toISOString())] : [],
  });
  const actOnOrder = vi.fn(async () => true);
  render(
    <MarketplaceOrderActions
      order={order}
      isBuyer={true}
      canCancel={false}
      canEditReview={canEditReview}
      actOnOrder={actOnOrder}
    />,
  );
  return { order, actOnOrder };
}

describe('MarketplaceOrderActions review editing', () => {
  it('offers the edit inside the 24-hour window in transaction-service mode', () => {
    renderActions({ reviewCreatedAt: new Date(Date.now() - (WINDOW_MS - 60_000)).toISOString() });

    expect(screen.getByRole('button', { name: 'Edit review' })).toBeInTheDocument();
    // The review already exists, so the create affordance is gone.
    expect(screen.queryByRole('button', { name: 'Leave review' })).not.toBeInTheDocument();
  });

  it('withholds the edit once the window has closed instead of failing on submit', () => {
    renderActions({ reviewCreatedAt: new Date(Date.now() - (WINDOW_MS + 60_000)).toISOString() });

    expect(screen.queryByRole('button', { name: 'Edit review' })).not.toBeInTheDocument();
  });

  it('withholds the edit in sandbox mode: the sandbox has no review.update command', () => {
    renderActions({ canEditReview: false });

    expect(screen.queryByRole('button', { name: 'Edit review' })).not.toBeInTheDocument();
  });

  it('withholds the edit when the caller has not reviewed the order', () => {
    renderActions({ withOwnReview: false });

    expect(screen.queryByRole('button', { name: 'Edit review' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave review' })).toBeInTheDocument();
  });

  it('prefills the existing review and submits review.update with the revised terms', async () => {
    const user = userEvent.setup();
    const { order, actOnOrder } = renderActions();

    await user.click(screen.getByRole('button', { name: 'Edit review' }));
    expect(screen.getByText('Edit your review')).toBeInTheDocument();

    const textField = screen.getByLabelText('Review');
    expect(textField).toHaveValue('Accurate and fast.');
    expect(screen.getByLabelText('Rating (1–5)')).toHaveValue('5');

    await user.clear(textField);
    await user.type(textField, 'Item arrived scratched after all.');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(actOnOrder).toHaveBeenCalledWith(order, 'review.update', {
      rating: 5,
      text: 'Item arrived scratched after all.',
    });
  });
});

describe('MarketplaceOrderActions amount-band opt-in (D2 both-sides consent)', () => {
  it('renders the opt-in only when the seller consented, and submits the buyer choice', async () => {
    mockedController.getMarketplaceBandConsent.mockResolvedValue(true);
    const user = userEvent.setup();
    const { order, actOnOrder } = renderActions({ withOwnReview: false });

    await user.click(screen.getByRole('button', { name: 'Leave review' }));
    const checkbox = await screen.findByRole('checkbox', { name: /include an approximate price range/i });
    expect(checkbox).not.toBeChecked();

    await user.type(screen.getByLabelText('Review'), 'Accurate and fast.');
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(actOnOrder).toHaveBeenCalledWith(order, 'review.create', {
      rating: 5,
      text: 'Accurate and fast.',
      allowAmountBand: true,
    });
  });

  it('defaults the opt-in to excluded (not included unless both sides opt in)', async () => {
    mockedController.getMarketplaceBandConsent.mockResolvedValue(true);
    const user = userEvent.setup();
    const { order, actOnOrder } = renderActions({ withOwnReview: false });

    await user.click(screen.getByRole('button', { name: 'Leave review' }));
    await screen.findByRole('checkbox', { name: /include an approximate price range/i });
    await user.type(screen.getByLabelText('Review'), 'Accurate and fast.');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(actOnOrder).toHaveBeenCalledWith(order, 'review.create', {
      rating: 5,
      text: 'Accurate and fast.',
      allowAmountBand: false,
    });
  });

  it('states truthfully that the seller has not enabled bands instead of a dead checkbox', async () => {
    mockedController.getMarketplaceBandConsent.mockResolvedValue(false);
    const user = userEvent.setup();
    renderActions({ withOwnReview: false });

    await user.click(screen.getByRole('button', { name: 'Leave review' }));
    expect(await screen.findByText(/has not enabled price-range sharing/i)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('renders neither checkbox nor note when the backend has no attestation support', async () => {
    mockedController.getMarketplaceBandConsent.mockResolvedValue(null);
    const user = userEvent.setup();
    renderActions({ withOwnReview: false });

    await user.click(screen.getByRole('button', { name: 'Leave review' }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/price-range sharing/i)).not.toBeInTheDocument();
  });
});

describe('MarketplaceOrderActions own-review verified status', () => {
  function publishedReviewRow(overrides: Partial<CommerceReviewModelSchema> = {}): CommerceReviewModelSchema {
    return {
      id: `${ORDER_FIXTURE_BUYER}:8Z8CWH8NVYQY39ZEBFGKQWWEKG`,
      owner_id: ORDER_FIXTURE_BUYER,
      review_id: '8Z8CWH8NVYQY39ZEBFGKQWWEKG',
      order_id: 'order-1',
      subject_id: 's'.repeat(52),
      record: {} as CommerceReviewModelSchema['record'],
      attestation_verified: true,
      attestation_iss: 'o'.repeat(52),
      sync_status: 'synced',
      updated_at: Date.now(),
      ...overrides,
    };
  }

  it('shows the verified state when the published record carries a verifying attestation', async () => {
    mockedController.getOwnMarketplaceReview.mockResolvedValue(publishedReviewRow());
    renderActions();

    await waitFor(() => {
      expect(screen.getByTestId('own-review-status')).toHaveTextContent(/Verified purchase/);
    });
    expect(screen.getByTestId('own-review-status')).toHaveTextContent(/signed by attestor oooooooo…/);
  });

  it('shows the pending-publication state truthfully', async () => {
    mockedController.getOwnMarketplaceReview.mockResolvedValue(publishedReviewRow({ sync_status: 'pending' }));
    renderActions();

    await waitFor(() => {
      expect(screen.getByTestId('own-review-status')).toHaveTextContent(/still pending and will retry/);
    });
  });

  it('never claims a public record exists when none was published', async () => {
    mockedController.getOwnMarketplaceReview.mockResolvedValue(null);
    renderActions();

    await waitFor(() => {
      expect(screen.getByTestId('own-review-status')).toHaveTextContent(/No public record was published/);
    });
  });
});
