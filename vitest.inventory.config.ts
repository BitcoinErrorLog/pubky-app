import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Headless staging proof for Inventory Studio W1: identity session, inventory
 * step-up grant `/pub/pubky.app/marketplace-service/v1/:rw`, then one stock
 * edit through the Wave 3a client. Excluded from every merge gate.
 *
 *   MARKETPLACE_STAGING_DROP_IDENTITIES_FILE=/path/outside/the/repo.json \
 *   npm run test:marketplace:inventory
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'inventory-studio-live',
    environment: 'node',
    include: ['src/test/live/inventory-studio.live.ts'],
    testTimeout: 180_000,
    hookTimeout: 120_000,
  },
});
