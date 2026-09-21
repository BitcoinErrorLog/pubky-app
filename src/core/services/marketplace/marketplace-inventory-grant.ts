/**
 * Studio inventory step-up grant. The only capability string Inventory Studio
 * may pass to `generateAuthTokenFlow`. Root `/:rw` covers the service ACL if
 * minted elsewhere; Studio must never request it.
 */
export const INVENTORY_GRANT = '/pub/pubky.app/marketplace-service/v1/:rw' as const;

export const INVENTORY_SESSION_STORAGE_KEY = 'pubky.marketplace.inventory-session.v1';

const ROOT_GRANT = '/:rw';

/** The allow-listed capability string for the Studio inventory mint. */
export function studioInventoryCapabilities(): typeof INVENTORY_GRANT {
  return INVENTORY_GRANT;
}

/**
 * True when a minted session's capability list covers inventory Read+Write.
 * Empty, `:r`, and unrelated paths do not. Root covers ACL but Studio never
 * requests it.
 */
export function inventoryCapabilityCovers(capabilities: string): boolean {
  const parts = capabilities
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.includes(INVENTORY_GRANT) || parts.includes(ROOT_GRANT);
}
