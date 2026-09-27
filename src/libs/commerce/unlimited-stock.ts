import { COMMERCE_LISTING_MAX_QUANTITY } from '@/config/commerce';
import { commerceListingFulfillmentMethods } from '@/libs/commerce/marketplace-records';

export const UNLIMITED_STOCK_LABEL = 'Unlimited';

export const UNLIMITED_STOCK_RESERVED_MESSAGE =
  '1,000,000 is reserved for unlimited digital stock. Enter the number of copies you have.';

/**
 * A typed quantity equal to the cap, the value Unlimited is stored as. On a
 * listing that ships or offers pickup it would publish the cap as physical
 * stock, so it is refused there whatever path put it in the form (a draft
 * saved before a fix, a hydrated edit, or typing).
 */
export function isUnlimitedStockSentinel(quantity: string): boolean {
  const value = quantity.trim();
  return /^[1-9]\d*$/.test(value) && Number(value) === COMMERCE_LISTING_MAX_QUANTITY;
}

type UnlimitedStockRecord = {
  fulfillmentMethods: Parameters<typeof commerceListingFulfillmentMethods>[0];
  digitalLock?: unknown;
};

type StockVariant = { quantity: number; enabled?: boolean };

/**
 * Unlimited stock is the domain quantity cap on a listing the service sells
 * as digital-only. A Locks listing carries `digitalLock`, so the service
 * registers it as shipping and it is never unlimited. Holds still reserve
 * units of the cap; this only decides how that cap is shown and counted.
 */
export function isUnlimitedStock(record: UnlimitedStockRecord, quantity: number): boolean {
  const methods = commerceListingFulfillmentMethods(record.fulfillmentMethods, record.digitalLock !== undefined);
  return methods.length === 1 && methods[0] === 'digital' && quantity === COMMERCE_LISTING_MAX_QUANTITY;
}

/**
 * A variant's stock as the listing form holds it. An unlimited variant keeps
 * no number: the cap is written again on save, and if the listing stops
 * being digital-only the seller must enter a real count rather than inherit
 * the cap as physical stock.
 */
export function stockFormFields(
  record: UnlimitedStockRecord,
  quantity: number,
): { quantity: string; unlimited: boolean } {
  return isUnlimitedStock(record, quantity)
    ? { quantity: '', unlimited: true }
    : { quantity: String(quantity), unlimited: false };
}

export function formatStockQuantity(record: UnlimitedStockRecord, quantity: number): string {
  return isUnlimitedStock(record, quantity) ? UNLIMITED_STOCK_LABEL : String(quantity);
}

export function formatListingStock(
  record: UnlimitedStockRecord & { variants: readonly { quantity: number }[] },
): string {
  if (record.variants.some((variant) => isUnlimitedStock(record, variant.quantity))) return UNLIMITED_STOCK_LABEL;
  return String(record.variants.reduce((total, variant) => total + variant.quantity, 0));
}

/** Enabled copies that are a real number. The cap is not one of them. */
export function countableStockQuantity(record: UnlimitedStockRecord & { variants: readonly StockVariant[] }): number {
  return record.variants.reduce((total, variant) => {
    if (!variant.enabled || isUnlimitedStock(record, variant.quantity)) return total;
    return total + variant.quantity;
  }, 0);
}
