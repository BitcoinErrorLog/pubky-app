const SESSION_PARAM = 's';

/**
 * How long a consumed `#s=` export stays valid for restore. A board hand-off
 * is applied within seconds of navigation; bounding the cache to 60 seconds
 * stops a hours-old fragment from being reused after a later same-tab logout.
 */
export const FRAGMENT_SESSION_EXPORT_TTL_MS = 60_000;

let consumed = false;
let cachedExport: string | null = null;
let capturedAt: number | null = null;

function hashSearchParams(hash: string): URLSearchParams {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  return new URLSearchParams(raw);
}

function resolveWindow(win?: Window): Window | undefined {
  if (win) {
    return win;
  }
  const g = globalThis as { window?: Window };
  return g.window;
}

export function readFragmentSessionExport(win?: Window): string | null {
  const w = resolveWindow(win);
  if (!w?.location) {
    return null;
  }
  const params = hashSearchParams(w.location.hash ?? '');
  const value = params.get(SESSION_PARAM);
  return value && value.length > 0 ? value : null;
}

export function clearFragmentSessionExport(win?: Window): void {
  const w = resolveWindow(win);
  if (!w?.location || !w.history?.replaceState) {
    return;
  }
  const params = hashSearchParams(w.location.hash ?? '');
  if (!params.has(SESSION_PARAM)) {
    return;
  }
  params.delete(SESSION_PARAM);
  const remaining = params.toString();
  const path = `${w.location.pathname}${w.location.search}`;
  const next = remaining.length > 0 ? `${path}#${remaining}` : path;
  w.history.replaceState(w.history.state, '', next);
}

/**
 * Read `#s=` once, strip it from the URL (even when empty / already consumed),
 * and cache the value for the restore path. Safe to call on every client boot.
 */
export function consumeFragmentSessionExport(win?: Window): string | null {
  if (!consumed) {
    cachedExport = readFragmentSessionExport(win);
    capturedAt = Date.now();
    consumed = true;
  }
  clearFragmentSessionExport(win);
  return cachedExport;
}

/** Cached export, or null when the capture is older than the TTL (also drops it). */
function freshCachedExport(): string | null {
  if (cachedExport === null) {
    return null;
  }
  if (capturedAt !== null && Date.now() - capturedAt > FRAGMENT_SESSION_EXPORT_TTL_MS) {
    cachedExport = null;
    capturedAt = null;
    return null;
  }
  return cachedExport;
}

/**
 * True when a consumed-but-not-yet-taken `#s=` export is cached and still
 * within its TTL. Calls consume so it also works if instrumentation-client
 * has not run yet.
 */
export function hasPendingFragmentSessionExport(win?: Window): boolean {
  consumeFragmentSessionExport(win);
  return freshCachedExport() !== null;
}

/**
 * Return the consumed fragment export for restore and clear the cache so a
 * later restore cannot reuse a board hand-off from this page load. Returns
 * null when the capture has outlived its TTL.
 */
export function takeFragmentSessionExport(win?: Window): string | null {
  consumeFragmentSessionExport(win);
  const value = freshCachedExport();
  cachedExport = null;
  capturedAt = null;
  return value;
}

/**
 * Drop the cached export without touching the URL. Called once the first
 * restore decision of the page load has run (whichever leg ran) so a later
 * same-tab logout cannot resurrect the hand-off.
 */
export function discardFragmentSessionExport(): void {
  cachedExport = null;
  capturedAt = null;
}

/** Test-only: reset the one-shot consume/take cache. */
export function resetFragmentSessionExportCache(): void {
  consumed = false;
  cachedExport = null;
  capturedAt = null;
}
