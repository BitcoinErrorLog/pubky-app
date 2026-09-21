import { describe, expect, it } from 'vitest';
import { INVENTORY_GRANT, inventoryCapabilityCovers, studioInventoryCapabilities } from './marketplace-inventory-grant';

describe('studio inventory grant allow-list', () => {
  it('is exactly the marketplace-service inventory path with read+write', () => {
    expect(INVENTORY_GRANT).toBe('/pub/pubky.app/marketplace-service/v1/:rw');
    expect(studioInventoryCapabilities()).toBe(INVENTORY_GRANT);
    expect(studioInventoryCapabilities()).not.toBe('/:rw');
    expect(studioInventoryCapabilities()).not.toBe('');
  });

  it('covers the inventory grant and root, and refuses empty or read-only', () => {
    expect(inventoryCapabilityCovers(INVENTORY_GRANT)).toBe(true);
    expect(inventoryCapabilityCovers(`other,${INVENTORY_GRANT}`)).toBe(true);
    expect(inventoryCapabilityCovers('/:rw')).toBe(true);
    expect(inventoryCapabilityCovers('')).toBe(false);
    expect(inventoryCapabilityCovers(':r')).toBe(false);
    expect(inventoryCapabilityCovers('/pub/pubky.app/marketplace-service/v1/:r')).toBe(false);
    expect(inventoryCapabilityCovers('/pub/paykit/v0/bitkit/server/:rw')).toBe(false);
  });
});
