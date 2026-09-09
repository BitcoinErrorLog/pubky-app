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
  drop: 'The transaction service could not be reached.',
  locksPayment: 'The payment request could not be created. Nothing was charged; you can retry.',
  session: 'Your marketplace session expired. Reconnect and try again.',
  unavailable: 'The marketplace service is temporarily unavailable.',
} as const;

type MarketplaceFailureCode = string | null | undefined;

const CODE_MESSAGES: Readonly<Record<string, string>> = {
  BAD_REQUEST: MARKETPLACE_FAILURE_MESSAGES.generic,
  CONFLICT: MARKETPLACE_FAILURE_MESSAGES.generic,
  DROP_RULE: 'The drop claim could not be completed.',
  FORBIDDEN: MARKETPLACE_FAILURE_MESSAGES.generic,
  INVALID_COMMAND: MARKETPLACE_FAILURE_MESSAGES.generic,
  INVALID_RESPONSE: MARKETPLACE_FAILURE_MESSAGES.unavailable,
  INVALID_STATE: MARKETPLACE_FAILURE_MESSAGES.generic,
  NOT_FOUND: MARKETPLACE_FAILURE_MESSAGES.generic,
  SESSION_EXPIRED: MARKETPLACE_FAILURE_MESSAGES.session,
  UNAUTHORIZED: MARKETPLACE_FAILURE_MESSAGES.session,
};

export function marketplaceFailureMessage(code: MarketplaceFailureCode, fallback: string): string {
  return (code && CODE_MESSAGES[code]) || fallback;
}

export function marketplaceErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}
