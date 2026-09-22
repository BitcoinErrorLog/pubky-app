import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/**
 * Wave A live proof: durable staging order → `?conversation=` gate.
 *
 *   MARKETPLACE_STAGING_MESSAGING_IDENTITIES_FILE=/path/outside/the/repo.json \
 *   npm run test:marketplace:messaging:wave-a
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'marketplace-messaging-wave-a-order',
    environment: 'node',
    include: ['src/test/live/messaging-wave-a-order.live.ts'],
    env: {
      NODE_ENV: 'test',
      NEXT_PUBLIC_APP_VERSION: '0.0.0-live',
      NEXT_PUBLIC_DB_VERSION: '6',
      NEXT_PUBLIC_DEBUG_MODE: 'false',
      PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE: 'transaction-service',
      PUBKY_RUNTIME_MARKETPLACE_URL: process.env.MARKETPLACE_SERVICE_URL ?? 'https://staging-api.pubky.app',
      PUBKY_RUNTIME_MARKETPLACE_NEXUS_URL: process.env.MARKETPLACE_NEXUS_URL ?? 'https://nexus.staging.pubky.app',
    },
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
