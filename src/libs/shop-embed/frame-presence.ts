// Diagnostics only (#2942): whether the same-origin Shop frame has run in this window. The Shop
// shares the SDK's session database, so a lost App session report says whether it was present.
let loadedAt: number | null = null;

export function markShopFrameLoaded(): void {
  loadedAt = Date.now();
}

/** Epoch milliseconds of the last Shop frame load in this window, or null when it never loaded. */
export function shopFrameLoadedAt(): number | null {
  return loadedAt;
}

/** Test isolation only. */
export function resetShopFramePresence(): void {
  loadedAt = null;
}
