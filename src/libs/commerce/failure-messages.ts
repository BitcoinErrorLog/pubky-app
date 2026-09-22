import { isAppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory } from '@/libs/error/error.types';

/** Client-owned copy for marketplace command and service failures. */
export const MARKETPLACE_FAILURE_MESSAGES = {
  offer: 'Could not update this offer.',
  offerChanged: 'This offer changed since you loaded it. The latest state was reloaded — retry from there.',
  offerCheckoutUnavailable: 'Checkout for this offer is unavailable.',
  offerExpired: 'This accepted offer expired before the order was placed. Nothing was ordered.',
  offerAlreadyConverted: 'This accepted offer has already been converted to an order.',
  sendOffer: 'Could not send this offer.',
  counterOffer: 'Could not send this counteroffer.',
  bid: 'Could not place this bid.',
  bidTooLow: 'Your new maximum must be higher than your previous maximum and the current visible price.',
  bidUnauthorized: 'You cannot bid on your own auction.',
  bidStale: 'The auction changed since you loaded it. Reload the latest price and try again.',
  bidClosed: 'This auction is no longer open for bidding.',
  message: 'Could not send this message.',
  notifications: 'Could not update commerce notifications.',
  order: 'Could not update this order.',
  orderChanged: 'This order changed since you loaded it. The latest state was reloaded — retry from there.',
  paymentChanged: 'This payment changed since you loaded it. The latest state was reloaded — retry from there.',
  checkout: 'Checkout could not be completed.',
  claim: 'The claim could not be submitted. Check your connection and try again.',
  claimAddress: 'Save a delivery address first — the claim sends it with the checkout.',
  claimListingUnavailable: 'This listing could not be prepared for checkout. It may have been removed by the seller.',
  claimRefusal: 'The claim could not be completed.',
  drop: 'The transaction service could not be reached.',
  dropRefusal: 'The drop action could not be completed.',
  locksPayment: 'The payment request could not be created. Nothing was charged; you can retry.',
  session: 'Your marketplace session expired. Reconnect and try again.',
  sessionTimeout: 'The approval expired before it was completed. Try again.',
  sessionStart: 'Could not start the marketplace session.',
  sessionMissing: 'Connect a marketplace session to continue. This is a new session, not an expired approval.',
  sessionCookieExpired:
    'This marketplace session is no longer valid. Connect a new session. This is not an expired signer approval.',
  soldOut: 'This drop is sold out.',
  listingSoldOut: 'This listing has sold out.',
  dropNotStarted: "This drop hasn't started yet.",
  dropEnded: 'This drop has ended.',
  dropPerBuyerLimit: "You have reached this drop's per-buyer limit.",
  shippingRates: 'Shipping rates are unavailable.',
  shippingLabel: 'The shipping label could not be purchased.',
  paymentSettings: 'Payment settings are unavailable.',
  bitcoinOfferUnavailable: 'Bitcoin is temporarily unavailable. Other payment methods are unaffected.',
  stripeKeyRemoval: 'The Stripe key could not be removed.',
  messagingStart: 'Could not start marketplace messaging.',
  messagingStorage: 'Messaging paused: storage protection unavailable',
  sandboxPayment: 'Could not advance the sandbox payment.',
  offersUnavailable: 'Marketplace offers are unavailable.',
  notificationsUnavailable: 'Commerce notifications are unavailable.',
  notificationsReadUnavailable: 'The durable marketplace service does not store read state yet.',
  notificationsReadFailed: 'Could not mark commerce notifications read.',
  notificationPreferencesUnavailable: 'The durable marketplace service does not store notification preferences yet.',
  notificationPreferencesFailed: 'Could not update commerce notification preferences.',
  ordersUnavailable: 'Marketplace orders are unavailable.',
  unavailable: 'The marketplace service is temporarily unavailable.',
  shopSettings: 'Could not save shop settings.',
  savedSearch: 'Could not save this search.',
  savedSearchDelete: 'Could not delete this saved search.',
  shippingSettings: 'The shipping settings could not be saved.',
  watchOnlyClaimInvalid: 'That does not look like an account xpub. Export the BIP84 account key from your wallet.',
  watchOnlyClaimStart: 'The watch-only claim could not be started.',
  watchOnlyClaimComplete: 'The watch-only claim could not be completed.',
  paymentSettingsSave: 'The payment settings could not be saved.',
} as const;

type MarketplaceFailureCode = string | null | undefined;

const CODE_MESSAGES: ReadonlyMap<string, string> = new Map([
  ['INSUFFICIENT_INVENTORY', MARKETPLACE_FAILURE_MESSAGES.soldOut],
  ['INVALID_RESPONSE', MARKETPLACE_FAILURE_MESSAGES.unavailable],
  ['SESSION_EXPIRED', MARKETPLACE_FAILURE_MESSAGES.session],
  ['UNAUTHORIZED', MARKETPLACE_FAILURE_MESSAGES.session],
  ['shop_session_missing', MARKETPLACE_FAILURE_MESSAGES.sessionMissing],
  ['shop_session_expired', MARKETPLACE_FAILURE_MESSAGES.sessionCookieExpired],
  ['flow_expired', MARKETPLACE_FAILURE_MESSAGES.sessionTimeout],
]);

const DROP_REFUSAL_MESSAGES: ReadonlyMap<string, string> = new Map([
  ['INVALID_STATE:The drop has not started.', MARKETPLACE_FAILURE_MESSAGES.dropNotStarted],
  ['INVALID_STATE:The drop has ended.', MARKETPLACE_FAILURE_MESSAGES.dropEnded],
  ['INSUFFICIENT_INVENTORY:The drop is sold out.', MARKETPLACE_FAILURE_MESSAGES.soldOut],
  ["INVALID_STATE:You have reached this drop's per-buyer limit.", MARKETPLACE_FAILURE_MESSAGES.dropPerBuyerLimit],
]);

const CHECKOUT_REFUSAL_MESSAGES: ReadonlyMap<string, string> = new Map([
  ['INSUFFICIENT_INVENTORY:Checkout quantity is unavailable.', MARKETPLACE_FAILURE_MESSAGES.listingSoldOut],
  [
    'INVALID_COMMAND:Checkout aggregate identity or revision is invalid.',
    'Checkout could not be started. Review your cart and try again.',
  ],
  ['NOT_FOUND:A checkout listing is unavailable.', 'A listing in your cart is no longer available.'],
  ['UNAUTHORIZED:A buyer cannot purchase their own listing.', 'You cannot purchase your own listing.'],
  [
    'INVALID_STATE:Only fixed-price listings can enter checkout.',
    'Only fixed-price listings can be purchased through checkout.',
  ],
  [
    "INVALID_STATE:Another buyer's payment is holding this item. If it isn't completed in time, the item restocks.",
    'Another buyer is currently paying for this item. If payment does not complete, it will become available again.',
  ],
  ['INVALID_STATE:This listing has sold out.', MARKETPLACE_FAILURE_MESSAGES.listingSoldOut],
  [
    'INVALID_STATE:Only available fixed-price listings can enter checkout.',
    'This listing is not available for checkout.',
  ],
]);

export function marketplaceCheckoutRefusalMessage(code: MarketplaceFailureCode, message: unknown): string | null {
  if (typeof code !== 'string' || typeof message !== 'string') return null;
  return CHECKOUT_REFUSAL_MESSAGES.get(`${code}:${message}`) ?? null;
}

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

export function marketplaceBidFailureMessage(code: MarketplaceFailureCode): string {
  if (code === 'BID_TOO_LOW') return MARKETPLACE_FAILURE_MESSAGES.bidTooLow;
  if (code === 'UNAUTHORIZED') return MARKETPLACE_FAILURE_MESSAGES.bidUnauthorized;
  if (code === 'REVISION_CONFLICT') return MARKETPLACE_FAILURE_MESSAGES.bidStale;
  if (code === 'INVALID_STATE') return MARKETPLACE_FAILURE_MESSAGES.bidClosed;
  return MARKETPLACE_FAILURE_MESSAGES.bid;
}

export function marketplaceOfferCheckoutFailureMessage(code: MarketplaceFailureCode): string {
  if (code === 'AWARD_EXPIRED') return MARKETPLACE_FAILURE_MESSAGES.offerExpired;
  if (code === 'AWARD_ALREADY_CONVERTED' || code === 'REVISION_CONFLICT') {
    return MARKETPLACE_FAILURE_MESSAGES.offerAlreadyConverted;
  }
  if (code === 'AWARD_QUANTITY_MISMATCH') return 'The checkout quantity does not match the accepted offer.';
  if (code === 'AWARD_VARIANT_MISMATCH') return 'The checkout variant does not match the accepted offer.';
  if (code === 'AWARD_LISTING_CHANGED') return 'The listing snapshot does not match the offer terms.';
  if (code === 'AWARD_HOLD_MISSING') return 'The inventory reserved for this accepted offer is no longer held.';
  if (code === 'INVALID_STATE') return 'Only an accepted offer can enter offer checkout.';
  return MARKETPLACE_FAILURE_MESSAGES.checkout;
}

export function marketplaceErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}
