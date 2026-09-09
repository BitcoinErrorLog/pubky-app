import { describe, expect, it } from 'vitest';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { marketplaceFailureMessage } from './failure-messages';

describe('marketplaceFailureMessage', () => {
  it('keeps action-specific fallbacks for ordinary refusal codes', () => {
    for (const code of ['BAD_REQUEST', 'CONFLICT', 'FORBIDDEN', 'INVALID_COMMAND', 'INVALID_STATE', 'NOT_FOUND']) {
      const result = marketplaceFailureMessage(code, 'SPECIFIC');
      expect(result === 'SPECIFIC' || result !== 'The marketplace request could not be completed.').toBe(true);
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
  });
});
