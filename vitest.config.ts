import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { playwright } from '@vitest/browser-playwright';
import { VRT_VIEWPORT_DESKTOP } from './src/test-utils/vrt.viewports';

// Tests that import the paykit-wasm binding must exercise the VENDORED
// artifact in this repository (vendor/paykit-wasm), not whatever a
// shared/linked node_modules happens to point at (e.g. worktrees sharing a
// sibling checkout's node_modules, where the file: symlink resolves to the
// sibling's vendor directory). This alias is INTENTIONALLY PERMANENT, not a
// worktree-local workaround: in a normal checkout it is a no-op (the file:
// dependency links node_modules/paykit-wasm to this same vendored path),
// while in shared-node_modules worktrees it pins tests to THIS repo's
// vendored artifact. Vitest projects do NOT inherit top-level resolve, so
// each project applies it via `paykitWasmAlias`.
const paykitWasmAlias = {
  'paykit-wasm': fileURLToPath(new URL('./vendor/paykit-wasm/paykit_wasm.js', import.meta.url)),
};

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    // Force a single copy of these packages so we never load two versions at once.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
    },
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: false,
    },
    resolveSnapshotPath: (testPath, snapExtension) => testPath + snapExtension,
    onConsoleLog(log) {
      if (
        log.includes('WebAssembly.instantiateStreaming') ||
        log.includes('application/wasm') ||
        log.includes('MIME type')
      ) {
        return false;
      }
      if (log.includes('Not implemented: navigation')) {
        return false;
      }
      return true;
    },
    dangerouslyIgnoreUnhandledErrors: false,
    silent: false,
    projects: [
      // Unit tests run in jsdom.
      {
        plugins: [react(), tsconfigPaths()],
        resolve: { alias: paykitWasmAlias },
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./src/config/test.ts'],
          globals: true,
          include: ['**/*.test.{ts,tsx}'],
          // .claude excludes local tooling worktrees checked out inside the repo.
          // ._* excludes macOS AppleDouble resource-fork files on external drives.
          exclude: ['**/node_modules/**', '**/.claude/**', '**/*.vrt.test.{ts,tsx}', '**/._*'],
          server: { deps: { inline: ['react-tweet'] } },
        },
      },
      // VRT(Visual Regression Tests) run in real browsers via Playwright.
      {
        plugins: [react(), tsconfigPaths()],
        optimizeDeps: {
          include: [
            'react',
            'react-dom',
            'react-dom/client',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
            'next/font/google',
            '@noble/hashes/blake3.js',
            '@noble/hashes/utils.js',
          ],
        },
        resolve: { alias: paykitWasmAlias },
        test: {
          name: 'vrt',
          globals: true,
          testTimeout: 30_000,
          include: ['**/*.vrt.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/.claude/**', '**/._*'],
          setupFiles: ['./src/test-utils/vrt.setup.ts'],
          server: { deps: { inline: ['react-tweet'] } },
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            // Shared by comparison (`npm run test:vrt`) and regeneration
            // (`--update`). A capture within this ratio of the committed
            // baseline is treated as unchanged, so `--update` only rewrites
            // baselines that changed beyond sub-pixel/anti-aliasing noise.
            // Trade-off: visual diffs under this ratio won't be flagged.
            expect: {
              toMatchScreenshot: {
                comparatorName: 'pixelmatch',
                comparatorOptions: {
                  allowedMismatchedPixelRatio: 0.001,
                },
                // Image-heavy suites (Home, Collections) on WebKit/Linux need
                // extra headroom for layout to settle after fonts/images decode.
                timeout: 15_000,
              },
            },
            // `viewport` below is the INITIAL browser size only. Each test
            // resizes the page per-call via `page.viewport(w, h)` inside
            // `renderForVRT` (see `src/test-utils/vrt.tsx`), so mobile
            // (VRT_VIEWPORT_MOBILE) is driven by the test, not by this
            // config. Add new sizes to `src/test-utils/vrt.viewports.ts`.
            instances: [
              {
                browser: 'chromium',
                viewport: VRT_VIEWPORT_DESKTOP,
              },
              {
                browser: 'firefox',
                viewport: VRT_VIEWPORT_DESKTOP,
              },
              {
                // `webkit` covers Safari's rendering engine.
                browser: 'webkit',
                viewport: VRT_VIEWPORT_DESKTOP,
              },
            ],
          },
        },
      },
    ],
  },
});
