import type { SpanJSON, TransactionEvent } from '@sentry/core';
import type * as Sentry from '@sentry/nextjs';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import {
  EMAIL_PATTERN,
  EMAIL_REDACTED,
  NEXUS_POST_TAGS_PATH_PATTERN,
  PHONE_PATTERN,
  PHONE_REDACTED,
  PUBKY_COMPACT_URI_PATTERN,
  PUBKY_HTTP_HOST_PATTERN,
  PUBKY_IDENTIFIER_KEYS,
  PUBKY_REDACTED,
  PUBKY_URI_PATTERN,
  RAW_PUBKY_PATTERN,
  SENSITIVE_CONTEXT_KEYS,
  SENSITIVE_VALUE_REDACTED,
} from './sentry.constants';

function normalizeContextKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveContextKey(key: string): boolean {
  const normalizedKey = normalizeContextKey(key);
  return SENSITIVE_CONTEXT_KEYS.has(normalizedKey) || PUBKY_IDENTIFIER_KEYS.has(normalizedKey);
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function scrubSensitiveString(value: string): string {
  const scrubbed = value
    .replace(PUBKY_URI_PATTERN, PUBKY_REDACTED)
    .replace(PUBKY_HTTP_HOST_PATTERN, PUBKY_REDACTED)
    .replace(PUBKY_COMPACT_URI_PATTERN, PUBKY_REDACTED)
    .replace(RAW_PUBKY_PATTERN, PUBKY_REDACTED)
    .replace(EMAIL_PATTERN, EMAIL_REDACTED)
    .replace(PHONE_PATTERN, PHONE_REDACTED);

  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object') return scrubbed;
    return JSON.stringify(sanitizeForSentry(parsed));
  } catch {
    return scrubbed;
  }
}

function getEndpointPath(endpoint: unknown): string | null {
  if (typeof endpoint !== 'string') return null;

  try {
    return new URL(endpoint).pathname;
  } catch {
    return endpoint.startsWith('/') ? endpoint.split('?')[0] : null;
  }
}

type AppErrorDropRule = {
  name: string;
  reason: string;
  matches: (error: AppError) => boolean;
};

function matchesEndpointPath(error: AppError, pattern: RegExp): boolean {
  const endpointPath = getEndpointPath(error.context?.endpoint);
  return endpointPath ? pattern.test(endpointPath) : false;
}

const APP_ERROR_DROP_RULES: AppErrorDropRule[] = [
  {
    name: 'nexus-post-tags-404',
    reason: 'Low-value post-tags telemetry; Nexus retry behavior is preserved and other Nexus errors stay reportable.',
    matches: (error) =>
      error.service === ErrorService.Nexus &&
      error.operation === 'fetchNexus' &&
      error.code === ClientErrorCode.NOT_FOUND &&
      error.context?.statusCode === HttpStatusCode.NOT_FOUND &&
      matchesEndpointPath(error, NEXUS_POST_TAGS_PATH_PATTERN),
  },
];

export function shouldDropAppErrorFromSentry(error: AppError): boolean {
  return APP_ERROR_DROP_RULES.some((rule) => rule.matches(error));
}

function isSensitiveFieldValue(parent: Record<string, unknown>, key: string): boolean {
  if (normalizeContextKey(key) !== 'value') return false;
  if (typeof parent.field !== 'string') return false;
  return isSensitiveContextKey(parent.field);
}

type SanitizationState = {
  active: WeakSet<object>;
  sanitized: WeakMap<object, unknown>;
};

function sanitizeRecursively(value: unknown, state: SanitizationState): unknown {
  if (typeof value === 'string') {
    return scrubSensitiveString(value);
  }

  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return SENSITIVE_VALUE_REDACTED;
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (state.active.has(value)) {
    return '[redacted: circular reference]';
  }

  if (state.sanitized.has(value)) {
    return state.sanitized.get(value);
  }

  if (Array.isArray(value)) {
    const sanitized: unknown[] = [];
    state.sanitized.set(value, sanitized);
    state.active.add(value);
    for (const item of value) {
      sanitized.push(sanitizeRecursively(item, state));
    }
    state.active.delete(value);
    return sanitized;
  }

  if (!isPlainObject(value)) {
    return SENSITIVE_VALUE_REDACTED;
  }

  const sanitized: Record<string, unknown> = {};
  state.sanitized.set(value, sanitized);
  state.active.add(value);
  for (const [key, item] of Object.entries(value)) {
    const sanitizedItem =
      isSensitiveContextKey(key) || isSensitiveFieldValue(value as Record<string, unknown>, key)
        ? SENSITIVE_VALUE_REDACTED
        : sanitizeRecursively(item, state);
    Object.defineProperty(sanitized, key, {
      configurable: true,
      enumerable: true,
      value: sanitizedItem,
      writable: true,
    });
  }
  state.active.delete(value);

  return sanitized;
}

export function sanitizeForSentry(value: unknown): unknown {
  return sanitizeRecursively(value, {
    active: new WeakSet<object>(),
    sanitized: new WeakMap<object, unknown>(),
  });
}

/**
 * Removes sensitive values from Sentry's last-chance hook input.
 *
 * Sentry invokes `beforeSend` after integrations and event processors. Values they already copied
 * from the hint are protected by the event scrub below, while this hint scrub protects retained
 * carriers and removes attachments before Sentry builds the outgoing envelope.
 */
function scrubSensitiveEventHint(hint: Sentry.EventHint | undefined): void {
  if (!hint) return;

  if (hint.data !== undefined) {
    hint.data = sanitizeForSentry(hint.data);
  }

  if (hint.captureContext !== undefined) {
    hint.captureContext = sanitizeForSentry(hint.captureContext) as Sentry.EventHint['captureContext'];
  }

  if (hint.originalException !== undefined) {
    hint.originalException = sanitizeForSentry(hint.originalException);
  }

  // Attachments are opaque uploads whose filename and payload are both user-controlled.
  // They cannot be inspected safely (payloads may be binary), so fail closed by dropping them.
  if (hint.attachments !== undefined) {
    hint.attachments = [];
  }

  // Error is a non-plain object and its message/stack can contain secrets. The event already
  // contains the sanitized exception details, so the safest hint representation is no exception.
  if (hint.syntheticException !== undefined) {
    hint.syntheticException = null;
  }
}

const STRUCTURAL_NAME_CONTEXTS = new Set(['browser', 'device', 'gpu', 'os', 'runtime']);

function scrubEventContexts(contexts: Sentry.ErrorEvent['contexts']): Sentry.ErrorEvent['contexts'] {
  if (!contexts) return contexts;

  const sanitized: NonNullable<Sentry.ErrorEvent['contexts']> = {};
  for (const [name, context] of Object.entries(contexts)) {
    if (context === undefined) continue;

    const sanitizedContext = sanitizeForSentry(context) as Sentry.Context;

    // SDK-owned contexts use `name` structurally. Apply keyed redaction to every context first,
    // then restore only this documented field after pattern-scrubbing its string value.
    if (
      STRUCTURAL_NAME_CONTEXTS.has(name) &&
      typeof context.name === 'string' &&
      sanitizedContext &&
      typeof sanitizedContext === 'object'
    ) {
      sanitizedContext.name = scrubSensitiveString(context.name);
    }
    sanitized[name] = sanitizedContext;
  }
  return sanitized;
}

/**
 * Defensive PII filter — redacts user-provided identifiers across application-owned
 * event surfaces (messages, exception values, breadcrumb data, extras, and AppError context).
 *
 * The browser/server initializers also set sendDefaultPii: false; this hook is a
 * second line of defense for application payloads we attach ourselves.
 */
export function scrubSensitiveData(event: Sentry.ErrorEvent, hint?: Sentry.EventHint): Sentry.ErrorEvent | null {
  scrubSensitiveEventHint(hint);

  event.message = event.message ? scrubSensitiveString(event.message) : event.message;

  if (event.exception) {
    event.exception = sanitizeForSentry(event.exception) as Sentry.ErrorEvent['exception'];
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.flatMap((breadcrumb) => {
      const sanitized = scrubBreadcrumb(breadcrumb);
      return sanitized ? [sanitized] : [];
    });
  }

  if (event.contexts) {
    event.contexts = scrubEventContexts(event.contexts);
  }

  if (event.extra) {
    event.extra = sanitizeForSentry(event.extra) as Record<string, unknown>;
  }

  if (event.request) {
    event.request = sanitizeForSentry(event.request) as Sentry.ErrorEvent['request'];
  }

  if (event.user) {
    event.user = sanitizeForSentry(event.user) as Sentry.ErrorEvent['user'];
  }

  return event;
}

/**
 * Last-chance breadcrumb ingress filter. Breadcrumb data is application-controlled and can
 * contain arbitrary nested values, so it uses the same fail-closed recursive redactor as events.
 */
export function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  const sanitized = sanitizeForSentry(breadcrumb);
  return sanitized !== null && typeof sanitized === 'object' && isPlainObject(sanitized)
    ? (sanitized as Sentry.Breadcrumb)
    : null;
}

/**
 * Defensive PII filter for transaction events.
 *
 * `event.transaction` is a structural string and receives pattern scrubbing. Request data,
 * breadcrumbs, application contexts, extra/user data, and trace data can contain arbitrary
 * application values, so they receive recursive pattern and keyed redaction.
 *
 * SDK-structural context fields keep their schema (for example `browser.name`); their strings
 * are still pattern-scrubbed. `event.spans[]` is handled per-span by `beforeSendSpan`.
 */
export function scrubTransactionEvent(event: TransactionEvent): TransactionEvent {
  if (typeof event.transaction === 'string') {
    event.transaction = scrubSensitiveString(event.transaction);
  }

  if (event.request) {
    event.request = sanitizeForSentry(event.request) as typeof event.request;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.flatMap((breadcrumb) => {
      const sanitized = scrubBreadcrumb(breadcrumb);
      return sanitized ? [sanitized] : [];
    });
  }

  if (event.contexts) {
    event.contexts = scrubEventContexts(event.contexts);
  }

  if (event.extra) {
    event.extra = sanitizeForSentry(event.extra) as typeof event.extra;
  }

  if (event.user) {
    event.user = sanitizeForSentry(event.user) as typeof event.user;
  }

  // Tags are app-controlled operational labels; do not walk them as user payload.

  return event;
}

/**
 * Defensive PII filter for span events.
 *
 * Span `description` (often a URL) receives pattern scrubbing. `span.data` can contain
 * arbitrary application attributes, so it receives recursive pattern and keyed redaction.
 * The same span object is returned, as required by the v10.51 hook contract.
 */
export function scrubSpanJson(span: SpanJSON): SpanJSON {
  if (typeof span.description === 'string') {
    span.description = scrubSensitiveString(span.description);
  }

  if (span.data) {
    span.data = sanitizeForSentry(span.data) as SpanJSON['data'];
  }

  return span;
}
