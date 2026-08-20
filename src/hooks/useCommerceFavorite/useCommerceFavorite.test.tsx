import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useCommerceFavorite } from './useCommerceFavorite';

const state = vi.hoisted(() => ({
  currentUserPubky: 'y'.repeat(52) as string | null,
  favorite: false,
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (query: () => unknown) => query(),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (store: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: state.currentUserPubky }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    requireAuth: (action: () => unknown) => (state.currentUserPubky ? action() : undefined),
  }),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    isFavorite: vi.fn(() => state.favorite),
    commitCreateFavorite: vi.fn(),
    commitDeleteFavorite: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

describe('useCommerceFavorite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.currentUserPubky = 'y'.repeat(52);
    state.favorite = false;
  });

  it('creates and removes a persistent favorite from live state', async () => {
    const { result, rerender } = renderHook(() => useCommerceFavorite(`${'b'.repeat(52)}:boots_01`));

    await act(() => result.current.toggle());
    expect(CommerceController.commitCreateFavorite).toHaveBeenCalledOnce();

    state.favorite = true;
    rerender();
    expect(result.current.isFavorite).toBe(true);

    await act(() => result.current.toggle());
    expect(CommerceController.commitDeleteFavorite).toHaveBeenCalledOnce();
  });

  it('does not mutate when signed out', async () => {
    state.currentUserPubky = null;
    const { result } = renderHook(() => useCommerceFavorite(`${'b'.repeat(52)}:boots_01`));

    await act(() => result.current.toggle());

    expect(CommerceController.commitCreateFavorite).not.toHaveBeenCalled();
    expect(CommerceController.commitDeleteFavorite).not.toHaveBeenCalled();
  });
});
