import { z } from 'zod';
import { getCommerceAdapterMode, getMarketplaceUrl } from '@/config/commerce';
import { commercePubkySchema } from '@/libs/commerce/transaction-contracts';
import { toCamelCaseWire } from '@/libs/commerce/wire-casing';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import { Logger } from '@/libs/logger/logger';
import { HomeserverService } from '@/services/homeserver/homeserver';

/**
 * Treat a session as expired slightly before the server does, so a request
 * never departs with a token that dies in flight.
 */
const SESSION_EXPIRY_MARGIN_MS = 30_000;

const sessionResponseSchema = z.object({
  token: z.string().min(1),
  pubky: commercePubkySchema,
  capabilities: z.string(),
  expiresAt: z.iso.datetime({ offset: true }),
});

/** Session facts safe to hand to callers — never includes the bearer token. */
export type MarketplaceSessionInfo = {
  pubky: string;
  capabilities: string;
  expiresAt: string;
};

export type MarketplaceSessionFlow = {
  authorizationUrl: string;
  awaitSession: () => Promise<MarketplaceSessionInfo>;
  cancel: () => void;
};

type StoredMarketplaceSession = {
  token: string;
  pubky: string;
  capabilities: string;
  expiresAtMs: number;
  expiresAt: string;
};

/**
 * Holds the Marketplace Transaction Service session for the lifetime of the
 * signed-in browser session — IN MEMORY ONLY.
 *
 * The bearer token is deliberately never written to IndexedDB, localStorage,
 * sessionStorage, or cookies, and never logged: it is a capability to act as
 * the user on the transaction service, and its blast radius is bounded by
 * keeping it in this module's private field. Sign-out clears it via
 * `CommerceApplication.clearMarketplaceSession()`.
 *
 * Establishment (per `docs/ecommerce/service-auth.md`): the Pubky auth flow
 * yields an `AuthToken` after the user approves on their signer; the raw
 * postcard bytes are POSTed to `/v1/auth/sessions`, which verifies them with
 * `pubky-common` and answers with an opaque session token plus TTL. AuthTokens
 * are single-use, so an expired session cannot be refreshed silently — it
 * requires a fresh signer approval through {@link beginSessionFlow}.
 */
export class MarketplaceSessionService {
  private constructor() {}

  private static session: StoredMarketplaceSession | null = null;

  /**
   * Starts the interactive session flow. Returns the authorization URL to show
   * on the user's signer (QR/deeplink) and a lazy `awaitSession` that resolves
   * once the user approves and the transaction service issues a session.
   */
  static beginSessionFlow(): MarketplaceSessionFlow {
    this.assertTransactionServiceMode('beginSessionFlow');
    const flow = HomeserverService.generateAuthTokenFlow();
    return {
      authorizationUrl: flow.authorizationUrl,
      awaitSession: async () => {
        const authToken = await flow.awaitToken();
        return await this.establishWithAuthToken(authToken.toBytes());
      },
      cancel: flow.cancelAuthFlow,
    };
  }

  /**
   * Exchanges signed AuthToken bytes for a transaction-service session and
   * stores it in memory, replacing any previous session.
   */
  static async establishWithAuthToken(authTokenBytes: Uint8Array): Promise<MarketplaceSessionInfo> {
    this.assertTransactionServiceMode('establishWithAuthToken');
    const url = `${getMarketplaceUrl()}/v1/auth/sessions`;
    const response = await safeFetch(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: authTokenBytes as BodyInit,
      },
      ErrorService.Marketplace,
      'establishWithAuthToken',
    );
    if (!response.ok) {
      throw Err.auth(AuthErrorCode.INVALID_TOKEN, 'The marketplace service rejected the auth token.', {
        service: ErrorService.Marketplace,
        operation: 'establishWithAuthToken',
        context: { statusCode: response.status },
      });
    }
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'establishWithAuthToken', url);
    const parsed = sessionResponseSchema.safeParse(toCamelCaseWire(raw));
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned an invalid session response.', {
        service: ErrorService.Marketplace,
        operation: 'establishWithAuthToken',
        context: { statusCode: response.status },
      });
    }
    const { token, pubky, capabilities, expiresAt } = parsed.data;
    this.session = { token, pubky, capabilities, expiresAt, expiresAtMs: Date.parse(expiresAt) };
    Logger.info('Established marketplace transaction session', { pubky, expiresAt });
    return { pubky, capabilities, expiresAt };
  }

  /**
   * Returns the stored session (including the bearer token) when still valid,
   * dropping it once it reaches the expiry margin. Transport-layer use only.
   */
  static getActiveSession(): StoredMarketplaceSession | null {
    if (!this.session) return null;
    if (Date.now() >= this.session.expiresAtMs - SESSION_EXPIRY_MARGIN_MS) {
      this.session = null;
      return null;
    }
    return this.session;
  }

  /** Drops the in-memory session. Called on sign-out and on server-side 401. */
  static clearSession(): void {
    this.session = null;
  }

  private static assertTransactionServiceMode(operation: string): void {
    if (getCommerceAdapterMode() !== 'transaction-service') {
      throw Err.client(ClientErrorCode.BAD_REQUEST, 'Marketplace transaction-service sessions are disabled.', {
        service: ErrorService.Marketplace,
        operation,
      });
    }
  }
}
