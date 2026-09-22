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
    testTimeout: 180_000,
    hookTimeout: 60_000,
  },
});
