import { formatSats, isSatsAsset } from './pricing';
import type { CommerceMoney } from './transaction-contracts';

export function formatCommerceMoney(money: CommerceMoney): string {
  // Bitcoin at exponent 8 is satoshi-denominated (the convention this app's
  // sell studio writes and the payment rails settle); "15,000 sats" is the
  // same exact amount as "BTC 0.00015000", stated in its own minor unit.
  if (isSatsAsset(money)) {
    return formatSats(money.amountMinor);
  }
  const value = money.amountMinor / 10 ** money.exponent;
  if (/^[A-Z]{3}$/.test(money.currency)) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: money.currency,
        minimumFractionDigits: money.exponent,
        maximumFractionDigits: money.exponent,
      }).format(value);
    } catch {
      // Fall through to a deterministic asset-code representation.
    }
  }
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: money.exponent,
    maximumFractionDigits: money.exponent,
  })} ${money.currency}`;
}

export function formatCommerceCondition(condition: string): string {
  return condition
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
