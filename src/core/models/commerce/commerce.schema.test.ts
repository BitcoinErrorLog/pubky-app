import { describe, expect, it } from 'vitest';
import { isListingRegistrationPending } from './commerce.schema';

describe('isListingRegistrationPending', () => {
  it.each([
    { registration_status: undefined, expected: true },
    { registration_status: 'unregistered' as const, expected: true },
    { registration_status: 'registered' as const, expected: false },
  ])('returns $expected for $registration_status', ({ registration_status, expected }) => {
    expect(isListingRegistrationPending({ registration_status })).toBe(expected);
  });
});
