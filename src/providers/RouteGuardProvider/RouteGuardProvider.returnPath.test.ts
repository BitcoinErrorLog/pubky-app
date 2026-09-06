import { beforeEach, describe, expect, it } from 'vitest';
import {
  consumeRouteGuardReturnTo,
  isValidRouteGuardReturnToPath,
  ROUTE_GUARD_RETURN_TO_STORAGE_KEY,
  storeRouteGuardReturnTo,
} from './RouteGuardProvider.returnPath';

describe('RouteGuardProvider return path', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('validates same-origin relative paths only', () => {
    expect(isValidRouteGuardReturnToPath('/marketplace/orders')).toBe(true);
    expect(isValidRouteGuardReturnToPath('https://evil')).toBe(false);
    expect(isValidRouteGuardReturnToPath('//evil')).toBe(false);
    expect(isValidRouteGuardReturnToPath('javascript:alert(1)')).toBe(false);
  });

  it('stores and consumes an allowed route once', () => {
    storeRouteGuardReturnTo('/marketplace/orders');

    expect(consumeRouteGuardReturnTo(['/marketplace'])).toBe('/marketplace/orders');
    expect(window.sessionStorage.getItem(ROUTE_GUARD_RETURN_TO_STORAGE_KEY)).toBeNull();
    expect(consumeRouteGuardReturnTo(['/marketplace'])).toBeNull();
  });

  it('clears a stored route that is not allowed', () => {
    storeRouteGuardReturnTo('/marketplace/orders');

    expect(consumeRouteGuardReturnTo(['/feed'])).toBeNull();
    expect(window.sessionStorage.getItem(ROUTE_GUARD_RETURN_TO_STORAGE_KEY)).toBeNull();
  });
});
