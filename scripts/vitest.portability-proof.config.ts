import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Isolated harness for the live P1-PORT proof. Does not load src/config/test.ts
 * (that file mocks fetch and forces testnet).
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    name: 'portability-proof',
    environment: 'node',
    globals: false,
    include: ['scripts/pubchi-portability-proof.ts'],
    exclude: ['**/node_modules/**', '**/.claude/**', '**/._*'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    env: {
      COPYFILE_DISABLE: '1',
      NEXT_PUBLIC_APP_VERSION: '0.0.0-test',
      NEXT_PUBLIC_DB_VERSION: '1',
      NEXT_PUBLIC_DEBUG_MODE: 'false',
      PUBKY_RUNTIME_TESTNET: 'false',
      PUBKY_RUNTIME_ENV: 'staging',
      PUBKY_RUNTIME_PUBCHI_ENABLED: 'true',
      PUBKY_RUNTIME_PUBCHI_API_URL: 'https://example.com',
      PUBKY_RUNTIME_HOMESERVER: 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy',
      PUBKY_RUNTIME_PKARR_RELAYS: '["https://pkarr.pubky.app","https://pkarr.pubky.org"]',
    },
    server: { deps: { inline: ['@synonymdev/pubky'] } },
  },
});
