import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { createOrderFixture } from '@/test/fixtures/commerce/orders';
import { useMarketplaceDisputes } from './useMarketplaceDisputes';

const MODERATOR = 'm'.repeat(52);

const config = vi.hoisted(() => ({
  mode: 'transaction-service' as string,
}));

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommerceAdapterMode: () => config.mode };
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: MODERATOR }),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getMarketplaceDisputes: vi.fn(),
  },
}));

describe('useMarketplaceDisputes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.mode = 'transaction-service';
  });

  it('loads the adjudication queue and marks the account a moderator when the service serves it', async () => {
    const disputed = createOrderFixture('disputed');
    vi.mocked(CommerceController.getMarketplaceDisputes).mockResolvedValue([disputed]);

    const { result } = renderHook(() => useMarketplaceDisputes());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isModerator).toBe(true);
    expect(result.current.disputes).toEqual([disputed]);
    expect(result.current.error).toBeNull();
  });

  it('marks the account a non-moderator when the service refuses the queue (403 → null)', async () => {
    vi.mocked(CommerceController.getMarketplaceDisputes).mockResolvedValue(null);

    const { result } = renderHook(() => useMarketplaceDisputes());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // The queue must stay absent, not merely empty: isModerator === false is
    // the signal the moderation surface uses to render nothing at all.
    expect(result.current.isModerator).toBe(false);
    expect(result.current.disputes).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });

  it.each(['sandbox', 'unavailable', 'locks-paykit'])('never fetches in %s mode', async (mode) => {
    config.mode = mode;

    const { result } = renderHook(() => useMarketplaceDisputes());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isModerator).toBeNull();
    expect(result.current.adapterMode).toBe(mode);
    expect(CommerceController.getMarketplaceDisputes).not.toHaveBeenCalled();
  });

  it('surfaces actionable session guidance instead of a generic failure', async () => {
    const sessionError = new Error('A marketplace session is required.');
    sessionError.name = 'AppError';
    vi.mocked(CommerceController.getMarketplaceDisputes).mockRejectedValue(sessionError);

    const { result } = renderHook(() => useMarketplaceDisputes());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('A marketplace session is required.');
    expect(result.current.isModerator).toBeNull();
  });
});
