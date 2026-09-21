/** Injected into `vrt-marketplace` only. Vitest's `page` has no `addStyleTag`. */
export const VRT_MARKETPLACE_ZERO_MOTION_CSS =
  '* { transition-duration: 0s !important; animation-duration: 0s !important; }';

export const VRT_MARKETPLACE_ZERO_MOTION_STYLE_ID = '__vrt_marketplace_zero_motion__';

/**
 * Hover end-state must paint on the first frame. Shared VRT setup uses
 * `transition: none`, which updates CSSOM immediately (`getComputedStyle` and
 * `getBoundingClientRect`) while Firefox under full-suite load can still
 * screenshot the rest compositor frame. Duration 0s keeps a real transition
 * that completes on that frame. `offsetWidth` is layout-only and cannot
 * observe `transform: scale()`.
 */
export function injectMarketplaceZeroMotion(): void {
  if (document.getElementById(VRT_MARKETPLACE_ZERO_MOTION_STYLE_ID)) {
    return;
  }
  const styleEl = document.createElement('style');
  styleEl.id = VRT_MARKETPLACE_ZERO_MOTION_STYLE_ID;
  styleEl.textContent = VRT_MARKETPLACE_ZERO_MOTION_CSS;
  document.head.appendChild(styleEl);
}
