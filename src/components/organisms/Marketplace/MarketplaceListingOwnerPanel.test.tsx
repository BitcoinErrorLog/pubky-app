import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommerceListingRegistrationStatus } from '@/models/commerce/commerce.schema';
import { createCommerceListingFixture } from '@/test/fixtures/commerce/commerce';
import { MarketplaceListingOwnerPanel } from './MarketplaceListingOwnerPanel';

const controller = vi.hoisted(() => ({
  ensureListingRegistered: vi.fn(async () => false),
  canRegisterListings: vi.fn(() => true),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: controller,
}));

vi.mock('@/stores/commerce/commerce.store', () => ({
  useCommerceStore: (selector: (state: { marketplaceSession: object }) => unknown) =>
    selector({ marketplaceSession: {} }),
}));

describe('MarketplaceListingOwnerPanel registration self-heal', () => {
  beforeEach(() => {
    controller.ensureListingRegistered.mockClear();
    controller.canRegisterListings.mockReturnValue(true);
  });

  it.each([undefined, 'unregistered'] as const)('retries a pending registration (%s) with a session', (status) => {
    const record = createCommerceListingFixture();
    render(<MarketplaceListingOwnerPanel record={record} registrationStatus={status} />);

    expect(controller.ensureListingRegistered).toHaveBeenCalledWith(record);
    expect(screen.getByRole('button', { name: 'Register for checkout' })).toBeInTheDocument();
    expect(screen.queryByTestId('listing-registration-unsupported')).not.toBeInTheDocument();
  });

  it.each(['not_found', 'registered', 'unavailable'] as CommerceListingRegistrationStatus[])(
    'neither retries nor offers registration for %s',
    (status) => {
      render(<MarketplaceListingOwnerPanel record={createCommerceListingFixture()} registrationStatus={status} />);

      expect(controller.ensureListingRegistered).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Register for checkout' })).not.toBeInTheDocument();
    },
  );

  it('shows static copy instead of the button, and never retries, in a browser without Web Locks', () => {
    controller.canRegisterListings.mockReturnValue(false);
    render(<MarketplaceListingOwnerPanel record={createCommerceListingFixture()} registrationStatus="unregistered" />);

    expect(controller.ensureListingRegistered).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Register for checkout' })).not.toBeInTheDocument();
    expect(screen.getByTestId('listing-registration-unsupported')).toHaveTextContent(
      "This browser can't register listings for checkout. Update it or use another browser.",
    );
  });
});
