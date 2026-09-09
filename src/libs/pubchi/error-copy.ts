import { ERROR_CODES, type ErrorCode } from './schemas';

const SERVICE_ONLY_ERROR_CODES = [
  'TENANT_NOT_ENROLLED',
  'UNAUTHORIZED',
  'BUDGET_EXCEEDED',
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
  'BRAIN_UNAVAILABLE',
  'FEED_DISABLED',
  'AUDIENCE_MISMATCH',
] as const;

export const PUBCHI_ERROR_CODES = [...ERROR_CODES, ...SERVICE_ONLY_ERROR_CODES] as const;
export type PubchiErrorCode = (typeof PUBCHI_ERROR_CODES)[number];

export type PubchiErrorCopy = {
  message: string;
  supportCode?: string;
  settingsLink?: string;
};

const AUTHORIZATION_CODES = new Set<string>([
  'UNAUTHORIZED',
  'SIGNATURE_INVALID',
  'REQUEST_EXPIRED',
  'CLOCK_SKEW',
  'NONCE_REPLAY',
  'BODY_HASH_MISMATCH',
  'ASKER_MISMATCH',
  'BOT_MISMATCH',
  'DELEGATION_NOT_FOUND',
  'DELEGATION_INVALID',
  'DELEGATION_EXPIRED',
  'DELEGATION_PURPOSE_FORBIDDEN',
  'DELEGATION_OWNER_MISMATCH',
]);

const COPY_BY_CODE: Partial<Record<PubchiErrorCode, string>> = {
  FEED_SPECS_INVALID:
    "I couldn't turn that into a feed. Feeds show posts filtered by tags, reach (following, friends, web of trust, everyone) and sort. Try: 'a feed of posts tagged bitcoin or synonym from everyone, newest first'.",
  FEED_UNSUPPORTED_LIKES: "Feeds can't be built from likes yet. Try filtering posts by tags instead.",
  FEED_UNSUPPORTED_REACH: "That feed reach isn't available yet. Try following, friends, web of trust, or everyone.",
  PURPOSE_UNSUPPORTED: 'That kind of request is not available yet.',
  BUDGET_EXCEEDED: "Your Pubchi has used today's budget. It resets at midnight UTC.",
  RATE_LIMITED: 'Too many questions at once — wait a moment and try again.',
  UPSTREAM_UNAVAILABLE: "The graph service didn't answer in time. Try again in a minute.",
  BRAIN_UNAVAILABLE: "The graph service didn't answer in time. Try again in a minute.",
  FEED_DISABLED: 'Feed building is temporarily unavailable. Try again in a minute.',
  TENANT_NOT_ENROLLED: 'Your Pubchi is not set up yet. Open Settings → Pubchi to set it up.',
  VERSION_UNSUPPORTED: 'This version of the app is out of date — reload to update.',
  AUDIENCE_MISMATCH: 'This version of the app is out of date — reload to update.',
};

export function pubchiErrorCopy(code: string | undefined): PubchiErrorCopy {
  if (!code) {
    return { message: 'Something went wrong on the Pubchi service.' };
  }
  if (AUTHORIZATION_CODES.has(code)) {
    return {
      message: "This browser isn't authorized to ask for your Pubchi any more. Open Settings → Pubchi to set it up again.",
      supportCode: code,
      settingsLink: '/settings/pubchi',
    };
  }
  if (code === 'CONNECTION_FAILED' || code === 'REQUEST_TIMEOUT' || code === 'PUBCHI_UNAVAILABLE') {
    return {
      message: "I couldn't reach the Pubchi service. Check your connection and try again in a minute.",
      supportCode: code,
    };
  }
  if (code in COPY_BY_CODE) {
    return { message: COPY_BY_CODE[code as PubchiErrorCode]!, supportCode: code };
  }
  return {
    message: 'Something went wrong on the Pubchi service.',
    supportCode: code,
  };
}

export function isPubchiErrorCode(code: string): code is PubchiErrorCode {
  return (PUBCHI_ERROR_CODES as readonly string[]).includes(code);
}

export type { ErrorCode };
