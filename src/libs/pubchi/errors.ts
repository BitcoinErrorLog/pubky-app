import { ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { ERROR_CODES, type ErrorCode } from '@/libs/pubchi/schemas';

export function isPubchiErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

/** Extract a closed Pubchi error code from a response body. Nothing else is used. */
export function extractPubchiErrorCode(body: unknown): ErrorCode | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const record = body as Record<string, unknown>;
  if (isPubchiErrorCode(record.code)) return record.code;
  if (isPubchiErrorCode(record.error_code)) return record.error_code;
  if (record.error !== null && typeof record.error === 'object' && !Array.isArray(record.error)) {
    const nested = record.error as Record<string, unknown>;
    if (isPubchiErrorCode(nested.code)) return nested.code;
  }
  if (typeof record.error === 'string' && isPubchiErrorCode(record.error)) return record.error;
  return undefined;
}

export function pubchiValidationError(code: ErrorCode, operation: string) {
  return Err.validation(ValidationErrorCode.INVALID_INPUT, code, {
    service: ErrorService.Pubchi,
    operation,
    context: { pubchiCode: code },
  });
}

export function pubchiClientError(code: ErrorCode, operation: string) {
  return Err.client(ClientErrorCode.UNPROCESSABLE, code, {
    service: ErrorService.Pubchi,
    operation,
    context: { pubchiCode: code },
  });
}
