import { describe, expect, it } from 'vitest';
import { marketplaceFailureMessage } from './failure-messages';

describe('marketplaceFailureMessage', () => {
  it('never returns a server-provided message for a known code', () => {
    const sentinel = 'SENTINEL-14-Oak-Lane';
    expect(marketplaceFailureMessage('INVALID_STATE', sentinel)).toBe(
      'The marketplace request could not be completed.',
    );
    expect(marketplaceFailureMessage('NOT_FOUND', sentinel)).not.toContain(sentinel);
  });

  it('uses the static action fallback for unknown codes', () => {
    expect(marketplaceFailureMessage('SERVER_PRIVATE_CODE', 'Could not place bid')).toBe('Could not place bid');
  });
});
