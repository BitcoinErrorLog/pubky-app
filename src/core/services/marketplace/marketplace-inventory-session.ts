import { z } from 'zod';
import { getCommerceAdapterMode, getMarketplaceUrl, isDurableCommerceMode } from '@/config/commerce';
import { commercePubkySchema } from '@/libs/commerce/transaction-contracts';
import { toCamelCaseWire } from '@/libs/commerce/wire-casing';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpResponseToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { HomeserverService } from '@/services/homeserver/homeserver';
import {
  clampInventoryPersistedCapabilities,
  INVENTORY_GRANT,
  INVENTORY_SESSION_STORAGE_KEY,
  inventoryCapabilityCovers,
  studioInventoryCapabilities,
} from './marketplace-inventory-grant';
import {
  type MarketplaceSessionEndedEvent,
  type MarketplaceSessionEndedReason,
  type MarketplaceSessionFlow,
  type MarketplaceSessionInfo,
  MarketplaceSessionService,
  SESSION_FLOW_TIMEOUT_MS,
} from './marketplace-session';

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const sessionResponseSchema = z.object({
  token: z.string().regex(SESSION_TOKEN_PATTERN),
  sessionId: z.uuid().optional(),
  pubky: commercePubkySchema,
  capabilities: z.string(),
  expiresAt: z.iso.datetime({ offset: true }),
});

const SESSION_EXPIRY_MARGIN_MS = 30_000;

type StoredInventorySession = {
  token: string;
  sessionId?: string;
  pubky: string;
  capabilities: string;
  expiresAtMs: number;
  expiresAt: string;
  issuedAt: string;
};

/**
 * Seller-scoped inventory bearer, independent of the identity checkout session.
 * Mint uses `generateAuthTokenFlow(INVENTORY_GRANT)` and POSTs `/v1/auth/sessions`
 * into this slot. It never calls `MarketplaceSessionService.establishWithAuthToken`.
 */
export class MarketplaceInventorySessionService {
  private constructor() {}

  private static session: StoredInventorySession | null = null;
  private static sessionEndedListeners = new Set<(event: MarketplaceSessionEndedEvent) => void>();

  static onSessionEnded(listener: (event: MarketplaceSessionEndedEvent) => void): () => void {
    this.sessionEndedListeners.add(listener);
    return () => {
      this.sessionEndedListeners.delete(listener);
    };
  }

  static beginInventorySessionFlow(expectedPubky: string): MarketplaceSessionFlow {
    this.assertTransactionServiceMode('beginInventorySessionFlow');
    const identity = MarketplaceSessionService.getActiveSession();
    if (!identity || identity.pubky !== expectedPubky) {
      throw Err.auth(
        AuthErrorCode.UNAUTHORIZED,
        'Approve purchases first, then grant marketplace-service access for stock.',
        {
          service: ErrorService.Marketplace,
          operation: 'beginInventorySessionFlow',
        },
      );
    }
    const capabilities = studioInventoryCapabilities();
    if (capabilities !== INVENTORY_GRANT) {
      throw Err.client(
        ClientErrorCode.BAD_REQUEST,
        'Inventory Studio refused a capability string outside its allow-list.',
        {
          service: ErrorService.Marketplace,
          operation: 'beginInventorySessionFlow',
        },
      );
    }
    const flow = HomeserverService.generateAuthTokenFlow(capabilities);
    return {
      authorizationUrl: flow.authorizationUrl,
      awaitSession: async () => {
        const authToken = await MarketplaceSessionService.withFlowTimeout(flow.awaitToken(), flow.cancelAuthFlow);
        return await this.mintInventorySession(authToken.toBytes(), expectedPubky);
      },
      cancel: flow.cancelAuthFlow,
    };
  }

  static async mintInventorySession(
    authTokenBytes: Uint8Array,
    expectedPubky: string,
  ): Promise<MarketplaceSessionInfo> {
    this.assertTransactionServiceMode('mintInventorySession');
    const identity = MarketplaceSessionService.getActiveSession();
    if (!identity || identity.pubky !== expectedPubky) {
      throw Err.auth(
        AuthErrorCode.UNAUTHORIZED,
        'Approve purchases first, then grant marketplace-service access for stock.',
        {
          service: ErrorService.Marketplace,
          operation: 'mintInventorySession',
        },
      );
    }
    const url = `${getMarketplaceUrl()}/v1/auth/sessions`;
    const response = await safeFetch(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: authTokenBytes as BodyInit,
      },
      ErrorService.Marketplace,
      'mintInventorySession',
    );
    if (!response.ok) {
      if (response.status >= 500) {
        throw httpResponseToError(response, ErrorService.Marketplace, 'mintInventorySession', url);
      }
      throw Err.auth(AuthErrorCode.INVALID_TOKEN, 'The marketplace service rejected the inventory grant token.', {
        service: ErrorService.Marketplace,
        operation: 'mintInventorySession',
        context: { statusCode: response.status },
      });
    }
    const raw = await this.parseSessionMintBody(response);
    const parsed = sessionResponseSchema.safeParse(toCamelCaseWire(raw));
    if (!parsed.success) {
      throw Err.server(
        ServerErrorCode.INVALID_RESPONSE,
        'Marketplace returned an invalid inventory session response.',
        {
          service: ErrorService.Marketplace,
          operation: 'mintInventorySession',
          context: { statusCode: response.status },
        },
      );
    }
    if (parsed.data.pubky !== expectedPubky) {
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'Marketplace returned an inventory session for a different account.', {
        service: ErrorService.Marketplace,
        operation: 'mintInventorySession',
        context: { statusCode: response.status },
      });
    }
    const capabilities = clampInventoryPersistedCapabilities(parsed.data.capabilities);
    if (capabilities === null) {
      throw Err.auth(
        AuthErrorCode.FORBIDDEN,
        'Marketplace returned inventory capabilities outside the Studio allow-list.',
        {
          service: ErrorService.Marketplace,
          operation: 'mintInventorySession',
          context: { statusCode: response.status },
        },
      );
    }
    const { token, sessionId, pubky, expiresAt } = parsed.data;
    const issuedAt = new Date().toISOString();
    const session = { token, sessionId, pubky, capabilities, expiresAt };
    this.session = { ...session, expiresAtMs: Date.parse(expiresAt), issuedAt };
    this.writePersistedSession(session);
    Logger.info('Established marketplace inventory session', { pubky, expiresAt });
    return this.toPublicInfo(this.session);
  }

  static restorePersistedSession(expectedPubky: string): MarketplaceSessionInfo | null {
    if (!isDurableCommerceMode(getCommerceAdapterMode())) return null;
    const raw = this.readStorage();
    if (raw === null) return null;

    const parsed = sessionResponseSchema.safeParse(this.parseJson(raw));
    if (!parsed.success || parsed.data.pubky !== expectedPubky) {
      this.removePersistedSession();
      return null;
    }
    const capabilities = clampInventoryPersistedCapabilities(parsed.data.capabilities);
    if (capabilities === null) {
      this.removePersistedSession();
      return null;
    }
    const { token, sessionId, pubky, expiresAt } = parsed.data;
    const expiresAtMs = Date.parse(expiresAt);
    if (Date.now() >= expiresAtMs - SESSION_EXPIRY_MARGIN_MS) {
      this.removePersistedSession();
      return null;
    }

    const issuedAt = new Date().toISOString();
    this.session = { token, sessionId, pubky, capabilities, expiresAt, expiresAtMs, issuedAt };
    this.writePersistedSession({ token, sessionId, pubky, capabilities, expiresAt });
    Logger.info('Restored marketplace inventory session', { pubky, expiresAt });
    return this.toPublicInfo(this.session);
  }

  static getActiveSession(): StoredInventorySession | null {
    if (!this.session) return null;
    if (Date.now() >= this.session.expiresAtMs - SESSION_EXPIRY_MARGIN_MS) {
      this.clearSession('expired');
      return null;
    }
    return this.session;
  }

  static hasCoveringGrant(): boolean {
    const session = this.getActiveSession();
    return session !== null && inventoryCapabilityCovers(session.capabilities);
  }

  static clearSession(reason: MarketplaceSessionEndedReason = 'cleared'): void {
    const ended = this.session;
    this.session = null;
    this.removePersistedSession();
    if (!ended) return;
    this.notifySessionEnded({ reason, issuedAt: ended.issuedAt });
  }

  private static toPublicInfo(session: StoredInventorySession): MarketplaceSessionInfo {
    return {
      pubky: session.pubky,
      capabilities: session.capabilities,
      expiresAt: session.expiresAt,
      issuedAt: session.issuedAt,
    };
  }

  private static notifySessionEnded(event: MarketplaceSessionEndedEvent): void {
    const listeners = [...this.sessionEndedListeners];
    queueMicrotask(() => {
      for (const listener of listeners) listener(event);
    });
  }

  private static writePersistedSession(session: z.infer<typeof sessionResponseSchema>): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(INVENTORY_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      Logger.warn('Could not persist the inventory session; it will last until the next reload only.');
    }
  }

  private static removePersistedSession(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(INVENTORY_SESSION_STORAGE_KEY);
    } catch {
      // Removal failing means storage is unavailable, so nothing persisted either.
    }
  }

  private static readStorage(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(INVENTORY_SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private static parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private static async parseSessionMintBody(response: Response): Promise<unknown> {
    const text = await response.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw Err.server(
        ServerErrorCode.INVALID_RESPONSE,
        'Marketplace returned an unreadable inventory session response.',
        {
          service: ErrorService.Marketplace,
          operation: 'mintInventorySession',
          context: { statusCode: response.status },
        },
      );
    }
  }

  private static assertTransactionServiceMode(operation: string): void {
    if (!isDurableCommerceMode(getCommerceAdapterMode())) {
      throw Err.client(ClientErrorCode.BAD_REQUEST, 'Marketplace inventory sessions are disabled.', {
        service: ErrorService.Marketplace,
        operation,
      });
    }
  }
}

export { SESSION_FLOW_TIMEOUT_MS };
