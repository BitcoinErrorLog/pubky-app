import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceProjection } from './useMarketplaceProjection';

const config = vi.hoisted(() => ({
  mode: 'sandbox' as string,
}));

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommerceAdapterMode: () => config.mode, getCommercePollIntervalMs: () => 60_000 };
});

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getMarketplaceListingProjection: vi.fn(),
  },
}));

describe('useMarketplaceProjection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.mode = 'sandbox';
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

  it('exposes the authoritative sandbox listing projection', async () => {
    const { result } = renderHook(() => useMarketplaceProjection('y'.repeat(52), 'item'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(CommerceController.getMarketplaceListingProjection).toHaveBeenCalled();
    expect(result.current.projection).toMatchObject({
      serverRevision: 2,
      auction: { currentPrice: { amountMinor: 4_500 }, bidCount: 0 },
    });
    expect(result.current.error).toBeNull();
  });

  it('loads the projection in transaction-service mode — the revision source for every command', async () => {
    config.mode = 'transaction-service';
    const { result } = renderHook(() => useMarketplaceProjection('y'.repeat(52), 'item'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(CommerceController.getMarketplaceListingProjection).toHaveBeenCalled();
    expect(result.current.projection).toMatchObject({ serverRevision: 2 });
  });

  it('surfaces the durable session requirement instead of a generic failure', async () => {
    config.mode = 'transaction-service';
    const sessionError = Object.assign(new Error('A marketplace session is required.'), { name: 'AppError' });
    vi.mocked(CommerceController.getMarketplaceListingProjection).mockRejectedValue(sessionError);

    const { result } = renderHook(() => useMarketplaceProjection('y'.repeat(52), 'item'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('A marketplace session is required.');
  });

  it('loads nothing in modes without a transaction backend', async () => {
    config.mode = 'unavailable';
    const { result } = renderHook(() => useMarketplaceProjection('y'.repeat(52), 'item'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(CommerceController.getMarketplaceListingProjection).not.toHaveBeenCalled();
  });
});
