/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { BffError, mapBffError } from './bff';
import { GrantServiceError } from './service';

describe('mapBffError', () => {
  it('passes BffError status and code through unchanged', () => {
    expect(mapBffError(new BffError(401, 'shop_session_expired'))).toEqual({
      status: 401,
      code: 'shop_session_expired',
    });
  });

  it('maps a GrantServiceError 401 to HTTP 401 shop_session_expired', () => {
    expect(mapBffError(new GrantServiceError(401, 'invalid_session_pair'))).toEqual({
      status: 401,
      code: 'shop_session_expired',
    });
  });

  it('maps a GrantServiceError 403 to HTTP 401 shop_session_expired', () => {
    expect(mapBffError(new GrantServiceError(403, 'invalid_session_pair'))).toEqual({
      status: 401,
      code: 'shop_session_expired',
    });
  });

  it('maps identity_mismatch 409 through', () => {
    expect(mapBffError(new GrantServiceError(409, 'identity_mismatch'))).toEqual({
      status: 409,
      code: 'identity_mismatch',
    });
  });

  it('maps GrantServiceError 429 to retry_later', () => {
    expect(mapBffError(new GrantServiceError(429, 'slow_down'))).toEqual({
      status: 429,
      code: 'retry_later',
      retryAfterSeconds: 60,
    });
  });

  it('maps GrantServiceError 410 with the service code', () => {
    expect(mapBffError(new GrantServiceError(410, 'flow_gone'))).toEqual({
      status: 410,
      code: 'flow_gone',
    });
  });

  it('maps GrantServiceError 422 to approval_invalid', () => {
    expect(mapBffError(new GrantServiceError(422, 'bad_assertion'))).toEqual({
      status: 422,
      code: 'approval_invalid',
    });
  });

  it('maps GrantServiceError 5xx to 503 grant_unavailable', () => {
    expect(mapBffError(new GrantServiceError(502, 'bad_gateway'))).toEqual({
      status: 503,
      code: 'grant_unavailable',
    });
  });

  it('maps unreachable service failures to 503 grant_unavailable', () => {
    expect(mapBffError(new TypeError('fetch failed'))).toEqual({
      status: 503,
      code: 'grant_unavailable',
    });
  });
});
