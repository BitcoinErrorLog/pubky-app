import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePublicRoute } from './usePublicRoute';

// Mock next/navigation
const mockPathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

describe('usePublicRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('public routes', () => {
    it('returns isPublicRoute: true for single post page', () => {
      const pubky = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
      mockPathname.mockReturnValue(`/post/${pubky}/0034BBBDFK83G`);

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(true);
      expect(result.current.isDynamicPublicRoute).toBe(true);
      expect(result.current.isCoreExploreRoute).toBe(false);
      expect(result.current.isPublicExploreRoute).toBe(true);
    });

    it('returns isPublicRoute: true for other user profile page', () => {
      const pubky = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
      mockPathname.mockReturnValue(`/profile/${pubky}`);

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(true);
      expect(result.current.isDynamicPublicRoute).toBe(true);
      expect(result.current.isCoreExploreRoute).toBe(false);
      expect(result.current.isPublicExploreRoute).toBe(true);
    });

    it.each([
      ['/resources', false, true],
      ['/resources/d532410e857188ec16383d0654f4df1a', true, false],
      ['/resources/lookup', true, false],
      ['/resources/tag/bitcoin', true, false],
    ])('classifies public resource route %s', (pathname, isDynamicPublicRoute, isCoreExploreRoute) => {
      mockPathname.mockReturnValue(pathname);

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(isDynamicPublicRoute);
      expect(result.current.isDynamicPublicRoute).toBe(isDynamicPublicRoute);
      expect(result.current.isCoreExploreRoute).toBe(isCoreExploreRoute);
      expect(result.current.isPublicExploreRoute).toBe(true);
    });

    it('returns isPublicRoute: false for other user legacy posts URL (redirected; not public in guard)', () => {
      const pubky = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
      mockPathname.mockReturnValue(`/profile/${pubky}/posts`);

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
      expect(result.current.isDynamicPublicRoute).toBe(false);
      expect(result.current.isCoreExploreRoute).toBe(false);
      expect(result.current.isPublicExploreRoute).toBe(false);
    });
  });

  describe('non-public routes', () => {
    it('returns core explore state for home page', () => {
      mockPathname.mockReturnValue('/home');

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
      expect(result.current.isDynamicPublicRoute).toBe(false);
      expect(result.current.isCoreExploreRoute).toBe(true);
      expect(result.current.isPublicExploreRoute).toBe(true);
    });

    it('returns core explore state for hot page', () => {
      mockPathname.mockReturnValue('/hot');

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
      expect(result.current.isDynamicPublicRoute).toBe(false);
      expect(result.current.isCoreExploreRoute).toBe(true);
      expect(result.current.isPublicExploreRoute).toBe(true);
    });

    it('returns core explore state for search page', () => {
      mockPathname.mockReturnValue('/search');

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
      expect(result.current.isDynamicPublicRoute).toBe(false);
      expect(result.current.isCoreExploreRoute).toBe(true);
      expect(result.current.isPublicExploreRoute).toBe(true);
    });

    it('returns core explore state for collections overview page', () => {
      mockPathname.mockReturnValue('/collections');

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
      expect(result.current.isDynamicPublicRoute).toBe(false);
      expect(result.current.isCoreExploreRoute).toBe(true);
      expect(result.current.isPublicExploreRoute).toBe(true);
    });

    it('returns dynamic public state for single collection page', () => {
      const pubky = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';
      mockPathname.mockReturnValue(`/collections/${pubky}/0034BBBDFK83G`);

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(true);
      expect(result.current.isDynamicPublicRoute).toBe(true);
      expect(result.current.isCoreExploreRoute).toBe(false);
      expect(result.current.isPublicExploreRoute).toBe(true);
    });

    it('returns isPublicRoute: false for own profile page', () => {
      mockPathname.mockReturnValue('/profile');

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
      expect(result.current.isDynamicPublicRoute).toBe(false);
      expect(result.current.isCoreExploreRoute).toBe(false);
      expect(result.current.isPublicExploreRoute).toBe(false);
    });

    it('returns isPublicRoute: false for own profile sub-routes', () => {
      mockPathname.mockReturnValue('/profile/posts');

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
      expect(result.current.isDynamicPublicRoute).toBe(false);
      expect(result.current.isCoreExploreRoute).toBe(false);
      expect(result.current.isPublicExploreRoute).toBe(false);
    });

    it('returns isPublicRoute: false for settings page', () => {
      mockPathname.mockReturnValue('/settings');

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
      expect(result.current.isDynamicPublicRoute).toBe(false);
      expect(result.current.isCoreExploreRoute).toBe(false);
      expect(result.current.isPublicExploreRoute).toBe(false);
    });

    it('returns isPublicRoute: false for root page', () => {
      mockPathname.mockReturnValue('/');

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
      expect(result.current.isDynamicPublicRoute).toBe(false);
      expect(result.current.isCoreExploreRoute).toBe(false);
      expect(result.current.isPublicExploreRoute).toBe(false);
    });

    it.each([
      '/resources/settings',
      '/resources/admin',
      '/resources/manage-export',
      '/resources/LOOKUP',
      '/resources/%2Fmanage',
      '/resources/d532410e857188ec16383d0654f4df1a0',
      '/resources/tag/bitcoin/',
    ])('rejects non-canonical resource route %s', (pathname) => {
      mockPathname.mockReturnValue(pathname);

      const { result } = renderHook(() => usePublicRoute());

      expect(result.current.isPublicRoute).toBe(false);
      expect(result.current.isDynamicPublicRoute).toBe(false);
      expect(result.current.isCoreExploreRoute).toBe(false);
      expect(result.current.isPublicExploreRoute).toBe(false);
    });
  });
});
