import { isAppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory } from '@/libs/error/error.types';

/** Client-owned copy for marketplace command and service failures. */
export const MARKETPLACE_FAILURE_MESSAGES = {
  generic: 'The marketplace request could not be completed.',
  offer: 'Could not update this offer.',
  sendOffer: 'Could not send this offer.',
  counterOffer: 'Could not send this counteroffer.',
  bid: 'Could not place this bid.',
  message: 'Could not send this message.',
  notifications: 'Could not update commerce notifications.',
  order: 'Could not update this order.',
  checkout: 'Checkout could not be completed.',
  claim: 'The claim could not be submitted. Check your connection and try again.',
  claimRefusal: 'The claim could not be completed.',
  drop: 'The transaction service could not be reached.',
  dropRefusal: 'The drop action could not be completed.',
  locksPayment: 'The payment request could not be created. Nothing was charged; you can retry.',
  session: 'Your marketplace session expired. Reconnect and try again.',
  sessionTimeout: 'The approval expired before it was completed. Try again.',
  soldOut: 'This drop is sold out.',
  dropNotStarted: "This drop hasn't started yet.",
  dropEnded: 'This drop has ended.',
  dropPerBuyerLimit: "You've reached the per-buyer limit for this drop.",
  shippingRates: 'Shipping rates are unavailable.',
  shippingLabel: 'The shipping label could not be purchased.',
  paymentSettings: 'Payment settings are unavailable.',
  stripeKeyRemoval: 'The Stripe key could not be removed.',
  messagingStart: 'Could not start marketplace messaging.',
  sandboxPayment: 'Could not advance the sandbox payment.',
  offersUnavailable: 'Marketplace offers are unavailable.',
  ordersUnavailable: 'Marketplace orders are unavailable.',
  unavailable: 'The marketplace service is temporarily unavailable.',
} as const;

type MarketplaceFailureCode = string | null | undefined;

const CODE_MESSAGES: ReadonlyMap<string, string> = new Map([
  ['INSUFFICIENT_INVENTORY', MARKETPLACE_FAILURE_MESSAGES.soldOut],
  ['INVALID_RESPONSE', MARKETPLACE_FAILURE_MESSAGES.unavailable],
  ['SESSION_EXPIRED', MARKETPLACE_FAILURE_MESSAGES.session],
  ['UNAUTHORIZED', MARKETPLACE_FAILURE_MESSAGES.session],
]);

const DROP_REFUSAL_MESSAGES: ReadonlyMap<string, string> = new Map([
  ['INVALID_STATE:The drop has not started.', MARKETPLACE_FAILURE_MESSAGES.dropNotStarted],
  ['INVALID_STATE:The drop has ended.', MARKETPLACE_FAILURE_MESSAGES.dropEnded],
  ['INSUFFICIENT_INVENTORY:The drop is sold out.', MARKETPLACE_FAILURE_MESSAGES.soldOut],
  ["INVALID_STATE:You have reached this drop's per-buyer limit.", MARKETPLACE_FAILURE_MESSAGES.dropPerBuyerLimit],
]);

export function marketplaceDropRefusalMessage(code: MarketplaceFailureCode, message: unknown): string | null {
  if (typeof code !== 'string' || typeof message !== 'string') return null;
  return DROP_REFUSAL_MESSAGES.get(`${code}:${message}`) ?? null;
}

export function marketplaceFailureMessage(code: MarketplaceFailureCode, fallback: string, error?: unknown): string {
  if (
    isAppError(error) &&
    error.category === ErrorCategory.Validation &&
    Object.values(ValidationErrorCode).includes(error.code as ValidationErrorCode)
  ) {
    return error.message;
  }
  return (code && CODE_MESSAGES.get(code)) || fallback;
}

export function marketplaceErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}
