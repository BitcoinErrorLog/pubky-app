import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UseMarketplaceDropClaimResult } from '@/hooks/useMarketplaceDropClaim/useMarketplaceDropClaim';
import type { CommerceDropRecord } from '@/libs/commerce/marketplace-records';
import { DropClaimPanel } from './DropClaimPanel';

const SELLER = 's'.repeat(52);

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getOrFetchListing: vi.fn(async () => ({
      title: 'Field Recordings',
      media: [],
      sale: { format: 'fixed_price', unitPrice: { amountMinor: 5_000, currency: 'USD', exponent: 2 } },
    })),
    getIndicativeBtcRate: vi.fn(async () => null),
  },
}));

vi.mock('@/hooks/useMarketplaceMediaUrl/useMarketplaceMediaUrl', () => ({
  useMarketplaceFirstMediaUrls: () => [],
}));

function makeClaim(): UseMarketplaceDropClaimResult {
  return {
    addresses: [],
    claimAddress: {
      id: 'buyer:address',
      owner_id: 'b'.repeat(52),
      label: 'Home',
      name: 'Alice Buyer',
      line1: '1 Market Street',
      line2: '',
      city: 'New York',
      region: 'NY',
      postal_code: '10001',
      country_code: 'US',
      is_default: true,
      last_used_at: null,
      created_at: 1,
      updated_at: 1,
    },
    submittingListingId: null,
    claimedListingIds: new Set(),
    failure: null,
    needsSession: false,
    sessionError: null,
    claim: vi.fn(async () => true),
  };
}

describe('DropClaimPanel', () => {
  it('disables repeat claims and states the per-buyer limit at zero allowance', async () => {
    render(
      <DropClaimPanel
        record={{ ownerPubky: SELLER, listingIds: ['listing1'] } as CommerceDropRecord}
        claim={makeClaim()}
        remainingAllowance={0}
      />,
    );

    const button = await screen.findByRole('button', { name: 'Per-buyer limit reached' });
    expect(button).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent("You have reached this drop's per-buyer limit.");
  });
});
