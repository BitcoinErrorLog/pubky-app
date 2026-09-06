import { matchesAllowedRoute } from '@/app/routes';

export const ROUTE_GUARD_RETURN_TO_STORAGE_KEY = 'pubky.routeGuard.returnTo';

function getSessionStorage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export function isValidRouteGuardReturnToPath(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}

export function isRouteGuardReturnToAllowed(path: string, allowedRoutes: string[]): boolean {
  return allowedRoutes.some((route) => matchesAllowedRoute(path, route));
}

export function storeRouteGuardReturnTo(path: string): void {
  if (!isValidRouteGuardReturnToPath(path)) return;

  try {
    getSessionStorage()?.setItem(ROUTE_GUARD_RETURN_TO_STORAGE_KEY, path);
  } catch {
    // Best-effort: route guarding must keep working in storage-disabled contexts.
  }
}

export function consumeRouteGuardReturnTo(allowedRoutes: string[]): string | null {
  let path: string | null | undefined;

  try {
    path = getSessionStorage()?.getItem(ROUTE_GUARD_RETURN_TO_STORAGE_KEY);
    getSessionStorage()?.removeItem(ROUTE_GUARD_RETURN_TO_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!isValidRouteGuardReturnToPath(path)) return null;
  if (!isRouteGuardReturnToAllowed(path, allowedRoutes)) return null;

  return path;
}
