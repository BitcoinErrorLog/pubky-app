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

export function sanitizeForSentry(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return scrubSensitiveString(value);
  }

  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return SENSITIVE_VALUE_REDACTED;
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  if (seen.has(value)) {
    return '[redacted: circular reference]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForSentry(item, seen));
  }

  if (!isPlainObject(value)) {
    return SENSITIVE_VALUE_REDACTED;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] =
      isSensitiveContextKey(key) || isSensitiveFieldValue(value as Record<string, unknown>, key)
        ? SENSITIVE_VALUE_REDACTED
        : sanitizeForSentry(item, seen);
  }

  return sanitized;
}

/**
 * Removes sensitive values from Sentry's last-chance hook input.
 *
 * `EventHint` is SDK-local and is not serialized directly, but integrations can retain values
 * from it while constructing the event. Sanitizing its data carriers alongside the final event
 * makes the `beforeSend` boundary safe even when a new integration forwards hint metadata.
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

const SDK_STRUCTURAL_CONTEXTS = new Set([
  'app',
  'browser',
  'cloud_resource',
  'culture',
  'device',
  'flags',
  'gpu',
  'os',
  'profile',
  'replay',
  'response',
  'runtime',
  'state',
  'trace',
]);

function scrubEventContexts(contexts: Sentry.ErrorEvent['contexts']): Sentry.ErrorEvent['contexts'] {
  if (!contexts) return contexts;

  const sanitized: NonNullable<Sentry.ErrorEvent['contexts']> = {};
  for (const [name, context] of Object.entries(contexts)) {
    if (context === undefined) continue;

    if (SDK_STRUCTURAL_CONTEXTS.has(name)) {
      sanitized[name] = deepScrubTelemetryStrings(context, new WeakSet<object>());
    } else {
      sanitized[name] = sanitizeForSentry(context) as Sentry.Context;
    }
  }
  return sanitized;
}

/**
 * String-only deep walker for SDK-owned telemetry payloads (transactions, spans).
 *
 * Mutates `value` in place: every string descendant is replaced with the scrubbed string;
 * non-string scalars pass through unchanged. The same input reference is returned so callers
 * can keep their existing object identity (Sentry's `beforeSendTransaction` / `beforeSendSpan`
 * contracts expect a value to be returned, and aliased references in span/trace data must
 * observe the first-pass scrubbed value).
 *
 * Crucially, this walker does NOT apply key-based redaction. SDK-owned payloads use keys like
 * `name` (input attributes, browser/runtime/os/device contexts) for structural data, so the
 * keyed `sanitizeForSentry` walker would corrupt them. Use `sanitizeForSentry` only on
 * AppError-shaped attachments (`extra`, `user`, `error.context`).
 *
 * Arrays are handled before generic objects. The shared `seen` WeakSet guards against cycles
 * and ensures aliased subtrees aren't double-walked. On a re-visit the original reference is
 * returned unchanged — its strings were scrubbed during the first visit (mutate-in-place).
 */
function deepScrubTelemetryStrings<T>(value: T, seen: WeakSet<object>): T {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item === 'string') {
        value[i] = scrubSensitiveString(item);
      } else if (item !== null && typeof item === 'object') {
        deepScrubTelemetryStrings(item, seen);
      }
    }
    return value;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const item = obj[key];
    if (typeof item === 'string') {
      obj[key] = scrubSensitiveString(item);
    } else if (item !== null && typeof item === 'object') {
      deepScrubTelemetryStrings(item, seen);
    }
  }
  return value;
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
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
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
 * Tracing payloads are SDK-owned. `event.transaction`, `event.request`, and the root span data
 * at `event.contexts.trace.data` carry user-controlled URL strings (pageload/navigation routes,
 * fetch URLs) where pubky URIs and homeserver hostnames land verbatim. We mutate in place via
 * the string-only walker so aliased references converge on the scrubbed value.
 *
 * `event.extra`, `event.user`, and `event.contexts['error.context']` are the AppError-shaped
 * carriers that may surface on transactions when `Sentry.setUser` / `setExtra` / scope contexts
 * have been set application-side; those are routed through the keyed `sanitizeForSentry`
 * walker (copy-on-write) so we redact whole values keyed by sensitive name (e.g. `email`,
 * `displayName`).
 *
 * SDK-structural contexts (`browser`, `runtime`, `os`, `device`) are deliberately not walked —
 * the keyed walker would clobber `name: 'Chrome'` / `name: 'node'`, and the string-only walker
 * adds no value there. `event.spans[]` is handled per-span by `beforeSendSpan` and must not be
 * mutated here. Absent fields are not created.
 */
export function scrubTransactionEvent(event: TransactionEvent): TransactionEvent {
  const seen = new WeakSet<object>();

  if (typeof event.transaction === 'string') {
    event.transaction = scrubSensitiveString(event.transaction);
  }

  if (event.request && typeof event.request === 'object') {
    deepScrubTelemetryStrings(event.request, seen);
  }

  if (
    event.contexts &&
    event.contexts.trace &&
    event.contexts.trace.data &&
    typeof event.contexts.trace.data === 'object'
  ) {
    deepScrubTelemetryStrings(event.contexts.trace.data, seen);
  }

  if (event.extra) {
    event.extra = sanitizeForSentry(event.extra) as typeof event.extra;
  }

  if (event.user) {
    event.user = sanitizeForSentry(event.user) as typeof event.user;
  }

  if (event.contexts?.['error.context']) {
    event.contexts['error.context'] = sanitizeForSentry(event.contexts['error.context']) as Sentry.Context;
  }

  // Tags are app-controlled operational labels; do not walk them as user payload.

  return event;
}

/**
 * Defensive PII filter for span events.
 *
 * Span `description` (often a URL) and `span.data` (containing keys such as `http.url`,
 * `url.full`, `http.target`, `db.statement`) are user-controlled string surfaces. Walked
 * via the string-only walker; never apply key-based redaction (the SDK uses structural
 * keys here that overlap with our keyed walker's sensitive set). Always return the same
 * span object — `SpanJSON` is non-nullable in the v10.51 contract.
 */
export function scrubSpanJson(span: SpanJSON): SpanJSON {
  const seen = new WeakSet<object>();

  if (typeof span.description === 'string') {
    span.description = scrubSensitiveString(span.description);
  }

  if (span.data && typeof span.data === 'object') {
    deepScrubTelemetryStrings(span.data, seen);
  }

  return span;
}
