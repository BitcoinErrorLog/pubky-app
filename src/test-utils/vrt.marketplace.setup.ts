import { applyMarketplaceStabilizerRewrite, injectMarketplaceZeroMotion } from './vrt.marketplace-zero-motion';

// Shared `vrt.setup.ts` sets `transition: none` / `animation: none` on `*`.
// `transition: none` wins over `transition-duration: 0s` and is the observer
// that cannot wait: CSSOM jumps to the hover target while the compositor may
// still show rest. Replace only that shorthand so a 0s hover transition still
// runs. Leave `animation: none` in place — rewriting it to duration 0s
// re-enables delayed enter animations (see rewriteMarketplaceStabilizerCss).
applyMarketplaceStabilizerRewrite();
injectMarketplaceZeroMotion();
