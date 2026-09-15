import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode, ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import {
  MARKETPLACE_FAILURE_MESSAGES,
  marketplaceCheckoutRefusalMessage,
  marketplaceFailureMessage,
  marketplaceOfferCheckoutFailureMessage,
} from './failure-messages';

describe('marketplaceFailureMessage', () => {
  it('keeps action-specific fallbacks for ordinary refusal codes', () => {
    for (const code of ['BAD_REQUEST', 'CONFLICT', 'FORBIDDEN', 'INVALID_COMMAND', 'INVALID_STATE', 'NOT_FOUND']) {
      const result = marketplaceFailureMessage(code, 'SPECIFIC');
      expect(result).toBe('SPECIFIC');
    }
  });

  it('uses the static action fallback for unknown codes', () => {
    expect(marketplaceFailureMessage('SERVER_PRIVATE_CODE', 'Could not place bid')).toBe('Could not place bid');
  });

  it('does not expose prototype properties as messages', () => {
    for (const code of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(marketplaceFailureMessage(code, 'F')).toBe('F');
      expect(typeof marketplaceFailureMessage(code, 'F')).toBe('string');
    }
  });

  it('preserves client-authored validation errors but not wire messages', () => {
    const validationError = new AppError({
      category: ErrorCategory.Validation,
      code: ValidationErrorCode.INVALID_INPUT,
      message: 'A checkout group chooses a fulfillment its listing does not publish.',
      service: ErrorService.Marketplace,
      operation: 'checkout',
    });
    expect(marketplaceFailureMessage('INVALID_INPUT', 'Checkout failed.', validationError)).toBe(
      validationError.message,
    );
    expect(
      marketplaceFailureMessage('INVALID_INPUT', 'Checkout failed.', {
        code: 'INVALID_INPUT',
        message: validationError.message,
      }),
    ).toBe('Checkout failed.');

    const serverError = new AppError({
      category: ErrorCategory.Server,
      code: ServerErrorCode.INTERNAL_ERROR,
      message: 'SENTINEL_SERVER_TEXT_failure_messages',
      service: ErrorService.Marketplace,
      operation: 'checkout',
    });
    const clientError = new AppError({
      category: ErrorCategory.Client,
      code: ClientErrorCode.CONFLICT,
      message: 'SENTINEL_CLIENT_TEXT_failure_messages',
      service: ErrorService.Marketplace,
      operation: 'checkout',
    });
    expect(marketplaceFailureMessage('INTERNAL_ERROR', 'Checkout failed.', serverError)).toBe('Checkout failed.');
    expect(marketplaceFailureMessage('CONFLICT', 'Checkout failed.', clientError)).toBe('Checkout failed.');
    expect(marketplaceFailureMessage('INVALID_INPUT', 'Checkout failed.', validationError)).toBe(
      validationError.message,
    );
  });
});

describe('marketplaceCheckoutRefusalMessage', () => {
  const mappedRefusals = [
    [
      'INVALID_COMMAND',
      'Checkout aggregate identity or revision is invalid.',
      'Checkout could not be started. Review your cart and try again.',
    ],
    ['NOT_FOUND', 'A checkout listing is unavailable.', 'A listing in your cart is no longer available.'],
    ['UNAUTHORIZED', 'A buyer cannot purchase their own listing.', 'You cannot purchase your own listing.'],
    [
      'INVALID_STATE',
      'Only fixed-price listings can enter checkout.',
      'Only fixed-price listings can be purchased through checkout.',
    ],
    [
      'INVALID_STATE',
      "Another buyer's payment is holding this item. If it isn't completed in time, the item restocks.",
      'Another buyer is currently paying for this item. If payment does not complete, it will become available again.',
    ],
    ['INVALID_STATE', 'This listing has sold out.', MARKETPLACE_FAILURE_MESSAGES.listingSoldOut],
    ['INSUFFICIENT_INVENTORY', 'Checkout quantity is unavailable.', MARKETPLACE_FAILURE_MESSAGES.listingSoldOut],
    [
      'INVALID_STATE',
      'Only available fixed-price listings can enter checkout.',
      'This listing is not available for checkout.',
    ],
  ] as const;

  it.each(mappedRefusals)('maps %s refusal %s to static copy', (code, message, expected) => {
    expect(marketplaceCheckoutRefusalMessage(code, message)).toBe(expected);
  });

  it('returns null for unmapped and non-string inputs', () => {
    expect(marketplaceCheckoutRefusalMessage('INVALID_STATE', 'Unknown refusal')).toBeNull();
    expect(marketplaceCheckoutRefusalMessage(null, 'This listing has sold out.')).toBeNull();
    expect(marketplaceCheckoutRefusalMessage('INVALID_STATE', null)).toBeNull();
    expect(marketplaceCheckoutRefusalMessage(undefined, 42)).toBeNull();
  });

  it('does not use the session copy for an own-listing refusal', () => {
    expect(marketplaceCheckoutRefusalMessage('UNAUTHORIZED', 'A buyer cannot purchase their own listing.')).not.toBe(
      MARKETPLACE_FAILURE_MESSAGES.session,
    );
  });
});

describe('marketplaceOfferCheckoutFailureMessage', () => {
  it.each([
    ['AWARD_EXPIRED', MARKETPLACE_FAILURE_MESSAGES.offerExpired],
    ['AWARD_ALREADY_CONVERTED', MARKETPLACE_FAILURE_MESSAGES.offerAlreadyConverted],
    ['REVISION_CONFLICT', MARKETPLACE_FAILURE_MESSAGES.offerAlreadyConverted],
    ['AWARD_QUANTITY_MISMATCH', 'The checkout quantity does not match the accepted offer.'],
    ['AWARD_VARIANT_MISMATCH', 'The checkout variant does not match the accepted offer.'],
    ['AWARD_LISTING_CHANGED', 'The listing snapshot does not match the offer terms.'],
    ['AWARD_HOLD_MISSING', 'The inventory reserved for this accepted offer is no longer held.'],
    ['INVALID_STATE', 'Only an accepted offer can enter offer checkout.'],
  ] as const)('maps %s to static copy', (code, expected) => {
    expect(marketplaceOfferCheckoutFailureMessage(code)).toBe(expected);
  });

  it('uses the static checkout fallback for unknown codes', () => {
    expect(marketplaceOfferCheckoutFailureMessage('UNEXPECTED')).toBe(MARKETPLACE_FAILURE_MESSAGES.checkout);
  });
});
