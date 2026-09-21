import { injectMarketplaceZeroMotion } from './vrt.marketplace-zero-motion';

// Shared `vrt.setup.ts` sets `transition: none` / `animation: none` on `*`.
// That shorthand wins over `transition-duration: 0s` and is the observer that
// cannot wait: CSSOM jumps to the hover target while the compositor may still
// show rest. Replace the shorthand so a 0s transition still runs.
const stabilizer = document.getElementById('__vrt_stabilizer__');
if (stabilizer) {
  stabilizer.textContent = (stabilizer.textContent ?? '')
    .replace(/transition:\s*none\s*!important;?/g, 'transition-duration: 0s !important;')
    .replace(/animation:\s*none\s*!important;?/g, 'animation-duration: 0s !important;');
}

injectMarketplaceZeroMotion();
