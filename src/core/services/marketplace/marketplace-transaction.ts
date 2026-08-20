import { z } from 'zod';
import { getCommerceAdapterMode, getMarketplaceUrl } from '@/config/commerce';
import {
  type MarketplaceCommand,
  type MarketplaceCommandResponse,
  marketplaceCommandResponseSchema,
} from '@/libs/commerce/transaction-commands';
import { commercePubkySchema } from '@/libs/commerce/transaction-contracts';
import { toCamelCaseWire, toSnakeCaseWire } from '@/libs/commerce/wire-casing';
import { AuthErrorCode, ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import { MarketplaceSessionService } from './marketplace-session';

/**
 * Command kinds the durable Rust service implements (its envelope contract
 * rejects everything else until it is ported with its tests). Sandbox-only
 * kinds — `payment.sandbox_advance`, messaging, notifications, fulfillment,
 * returns, refunds, disputes, reviews — are rejected here, before any bytes
 * leave the client, so simulated affordances cannot reach the authority.
 */
const TRANSACTION_SERVICE_COMMAND_KINDS: ReadonlySet<MarketplaceCommand['kind']> = new Set([
  'listing.register',
  'inventory.reserve',
  'checkout.create',
  'offer.create',
  'offer.counter',
  'offer.accept',
  'offer.reject',
  'offer.withdraw',
  'auction.place_bid',
  'auction.close',
  'trust.report',
] satisfies MarketplaceCommand['kind'][]);

/**
 * Report view shared by both transports. The durable service adds `revision`
 * and `updatedAt` and moves reports past `open` via moderator decisions
 * (`trust.decide`); the sandbox never does either, so those fields stay
 * optional and `open` remains the only state it produces.
 */
export const marketplaceReportSchema = z
  .object({
    id: z.uuid(),
    reporterPubky: commercePubkySchema,
    targetType: z.enum(['listing', 'user', 'message', 'review']),
    targetId: z.string(),
    reason: z.enum(['prohibited_item', 'counterfeit', 'scam', 'harassment', 'unsafe', 'other']),
    details: z.string(),
    state: z.enum(['open', 'dismissed', 'actioned']),
    revision: z.number().int().positive().optional(),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

export type MarketplaceReport = z.infer<typeof marketplaceReportSchema>;

/**
 * Transport for the durable Rust Marketplace Transaction Service
 * (`pubky-marketplace-service`). Differences from the sandbox transport are
 * deliberate and load-bearing:
 *
 * - **Identity comes from the session**, never from a header. Requests carry
 *   the opaque bearer token issued by `POST /v1/auth/sessions`; the service
 *   resolves the actor from its stored hash. There is no `x-pubky-actor`.
 * - **Wire casing is snake_case** per ADR-0019 §3. The client's internal
 *   camelCase contracts are converted at this boundary only.
 * - **No projection reads.** The service exposes `POST /v1/commands` and
 *   `GET /v1/reports` — sandbox query endpoints (listings, orders, payments,
 *   conversations, notifications, attachments) do not exist here.
 */
export class MarketplaceTransactionService {
  private constructor() {}

  static async execute(actor: string, command: MarketplaceCommand): Promise<MarketplaceCommandResponse> {
    this.assertTransactionServiceMode('execute');
    if (!TRANSACTION_SERVICE_COMMAND_KINDS.has(command.kind)) {
      throw Err.client(
        ClientErrorCode.BAD_REQUEST,
        `The marketplace transaction service does not support '${command.kind}' commands.`,
        {
          service: ErrorService.Marketplace,
          operation: 'execute',
          context: { kind: command.kind },
        },
      );
    }
    const session = this.requireSession('execute', actor);
    const url = `${getMarketplaceUrl()}/v1/commands`;
    const response = await safeFetch(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(toSnakeCaseWire(command)),
      },
      ErrorService.Marketplace,
      'execute',
    );
    this.throwIfSessionRejected(response.status, 'execute');
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'execute', url);
    const parsed = marketplaceCommandResponseSchema.safeParse(toCamelCaseWire(raw));
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned an invalid command response.', {
        service: ErrorService.Marketplace,
        operation: 'execute',
        context: { statusCode: response.status },
      });
    }
    return parsed.data;
  }

  static async getReports(actor: string): Promise<MarketplaceReport[]> {
    this.assertTransactionServiceMode('getReports');
    const session = this.requireSession('getReports', actor);
    const url = `${getMarketplaceUrl()}/v1/reports`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { authorization: `Bearer ${session.token}` } },
      ErrorService.Marketplace,
      'getReports',
    );
    this.throwIfSessionRejected(response.status, 'getReports');
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Marketplace, 'getReports', url);
    const parsed = z.object({ reports: z.array(marketplaceReportSchema) }).safeParse(toCamelCaseWire(raw));
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Marketplace returned invalid moderation reports.', {
        service: ErrorService.Marketplace,
        operation: 'getReports',
        context: { statusCode: response.status },
      });
    }
    return parsed.data.reports;
  }

  private static requireSession(operation: string, actor: string): { token: string; pubky: string } {
    const session = MarketplaceSessionService.getActiveSession();
    if (!session) {
      throw Err.auth(
        AuthErrorCode.SESSION_EXPIRED,
        'A marketplace session is required. Approve the marketplace connection on your signer and try again.',
        { service: ErrorService.Marketplace, operation },
      );
    }
    if (session.pubky !== actor) {
      // A session minted for another key must never act for the current user.
      MarketplaceSessionService.clearSession();
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'The marketplace session belongs to a different pubky.', {
        service: ErrorService.Marketplace,
        operation,
      });
    }
    return session;
  }

  /**
   * Only the auth middleware answers 401 (command failures map to 403/404/409/422),
   * so a 401 always means the session is gone server-side — drop the local copy.
   */
  private static throwIfSessionRejected(statusCode: number, operation: string): void {
    if (statusCode !== HttpStatusCode.UNAUTHORIZED) return;
    MarketplaceSessionService.clearSession();
    throw Err.auth(
      AuthErrorCode.SESSION_EXPIRED,
      'The marketplace session expired. Approve the marketplace connection on your signer and try again.',
      { service: ErrorService.Marketplace, operation },
    );
  }

  private static assertTransactionServiceMode(operation: string): void {
    if (getCommerceAdapterMode() !== 'transaction-service') {
      throw Err.client(ClientErrorCode.BAD_REQUEST, 'Marketplace transaction-service commands are disabled.', {
        service: ErrorService.Marketplace,
        operation,
      });
    }
  }
}
