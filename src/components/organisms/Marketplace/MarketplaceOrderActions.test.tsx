import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { COMMERCE_REVIEW_EDIT_WINDOW_SECONDS } from '@/config/commerce';
import type { MarketplaceOrder } from '@/services/marketplace/marketplace';
import { createOrderFixture, ORDER_FIXTURE_BUYER } from '@/test/fixtures/commerce/orders';
import { MarketplaceOrderActions } from './MarketplaceOrderActions';

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
