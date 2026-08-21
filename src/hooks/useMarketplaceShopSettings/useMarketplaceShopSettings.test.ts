import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceShopSettings } from './useMarketplaceShopSettings';

const OWNER = 'y'.repeat(52);

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: OWNER }),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getShop: vi.fn(),
    getOrFetchShop: vi.fn(),
    commitUpsertShop: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

const publishedShop = {
  schemaVersion: 1 as const,
  recordType: 'shop' as const,
  ownerPubky: OWNER,
  revision: 3,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-10T10:00:00.000Z',
  name: 'Satoshi Vintage',
  bio: 'Independent circular fashion.',
  location: { countryCode: 'US', region: 'NY' },
  shippingPolicy: 'Ships within three business days.',
  returnPolicy: 'Returns accepted within 30 days.',
  vacationMode: false,
};

describe('useMarketplaceShopSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CommerceController.getOrFetchShop).mockRejectedValue(new Error('no shop record'));
    vi.mocked(CommerceController.getShop).mockResolvedValue(null);
  });

  it('publishes versioned owner-signed shop policies for a first-time seller', async () => {
    const { result } = renderHook(() => useMarketplaceShopSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasShop).toBe(false);

    act(() => {
      result.current.form.setValue('name', 'Satoshi Vintage');
      result.current.form.setValue('bio', 'Independent circular fashion.');
    });

    await act(() => result.current.submit());

    expect(CommerceController.commitUpsertShop).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerPubky: OWNER,
        revision: 1,
        name: 'Satoshi Vintage',
        shippingPolicy: expect.any(String),
        returnPolicy: expect.any(String),
        vacationMode: false,
      }),
    );
    expect(result.current.hasShop).toBe(true);
  });

  it('edits the published shop record network-first instead of restarting at revision 1', async () => {
    vi.mocked(CommerceController.getOrFetchShop).mockResolvedValue(publishedShop);

    const { result } = renderHook(() => useMarketplaceShopSettings());
    await waitFor(() => expect(result.current.hasShop).toBe(true));
    expect(result.current.form.getValues('name')).toBe('Satoshi Vintage');

    await act(() => result.current.submit());

    expect(CommerceController.commitUpsertShop).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 4, createdAt: publishedShop.createdAt }),
    );
  });

  it('falls back to the local cache when the homeserver is unreachable', async () => {
    vi.mocked(CommerceController.getOrFetchShop).mockRejectedValue(new Error('offline'));
    vi.mocked(CommerceController.getShop).mockResolvedValue({ record: publishedShop } as never);

    const { result } = renderHook(() => useMarketplaceShopSettings());
    await waitFor(() => expect(result.current.hasShop).toBe(true));

    expect(result.current.revision).toBe(3);
    expect(result.current.form.getValues('name')).toBe('Satoshi Vintage');
  });
});
