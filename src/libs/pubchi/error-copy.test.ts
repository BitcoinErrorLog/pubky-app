import { describe, expect, it } from 'vitest';
import { PUBCHI_ERROR_CODES, pubchiErrorCopy } from './error-copy';
import { ERROR_CODES } from './schemas';

describe('pubchiErrorCopy', () => {
  it('has human-readable copy for every vendored and service error code', () => {
    for (const code of PUBCHI_ERROR_CODES) {
      const copy = pubchiErrorCopy(code);

      expect(copy.message).toBeTruthy();
      expect(copy.message).not.toContain(code);
    }
    expect(PUBCHI_ERROR_CODES).toEqual(expect.arrayContaining([...ERROR_CODES]));
  });

  it('keeps unknown codes out of the message while retaining them for support', () => {
    expect(pubchiErrorCopy('NEW_SERVICE_CODE')).toEqual({
      message: 'Something went wrong on the Pubchi service.',
      supportCode: 'NEW_SERVICE_CODE',
    });
  });

  it('uses a separate message for network failures', () => {
    expect(pubchiErrorCopy('CONNECTION_FAILED').message).toBe(
      "I couldn't reach the Pubchi service. Check your connection and try again in a minute.",
    );
  });
});
