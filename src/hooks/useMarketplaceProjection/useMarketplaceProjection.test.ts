import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceProjection } from './useMarketplaceProjection';

vi.mock('@/config/commerce', () => ({
  getCommerceAdapterMode: () => 'sandbox',
  getCommercePollIntervalMs: () => 60_000,
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    initializeSandboxCatalog: vi.fn(),
    getMarketplaceListingProjection: vi.fn(),
  },
}));

describe('useMarketplaceProjection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CommerceController.initializeSandboxCatalog).mockResolvedValue(true);
    vi.mocked(CommerceController.getMarketplaceListingProjection).mockResolvedValue({
      aggregateId: 'listing:seller_item',
      sellerPubky: 'y'.repeat(52),
      listingId: 'item',
      serverRevision: 2,
      state: 'available',
      availableQuantity: 1,
      reservedQuantity: 0,
      unitPrice: { amountMinor: 4_500, currency: 'USD', exponent: 2 },
      saleFormat: 'auction',
      auction: {
        startsAt: '2026-08-19T20:00:00.000Z',
        endsAt: '2026-08-29T20:00:00.000Z',
        minimumIncrement: { amountMinor: 500, currency: 'USD', exponent: 2 },
        currentPrice: { amountMinor: 4_500, currency: 'USD', exponent: 2 },
        leaderPubky: null,
        bidCount: 0,
        reserveMet: false,
      },
    });
  });

  it('initializes and exposes the authoritative sandbox listing projection', async () => {
    const { result } = renderHook(() => useMarketplaceProjection('y'.repeat(52), 'item'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(CommerceController.initializeSandboxCatalog).toHaveBeenCalled();
    expect(result.current.projection).toMatchObject({
      serverRevision: 2,
      auction: { currentPrice: { amountMinor: 4_500 }, bidCount: 0 },
    });
    expect(result.current.error).toBeNull();
  });
});
