import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { InMemoryMarketplaceRepository, MarketplaceTransactionService } from './transaction-service';

export type MarketplaceServerMode = 'disabled' | 'sandbox';

export interface MarketplaceServerOptions {
  mode: MarketplaceServerMode;
  service?: MarketplaceTransactionService;
  maxBodyBytes?: number;
}

export function createMarketplaceHttpServer({
  mode,
  service = new MarketplaceTransactionService(new InMemoryMarketplaceRepository()),
  maxBodyBytes = 1_000_000,
}: MarketplaceServerOptions): Server {
  return createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && request.url === '/health/live') {
        writeJson(response, 200, { status: 'live' }, mode);
        return;
      }

      if (request.method === 'GET' && request.url === '/health/ready') {
        const ready = mode === 'sandbox';
        writeJson(
          response,
          ready ? 200 : 503,
          {
            status: ready ? 'ready' : 'not_ready',
            mode,
            storage: 'memory',
          },
          mode,
        );
        return;
      }

      if (request.method === 'POST' && request.url === '/v1/commands') {
        if (mode !== 'sandbox') {
          writeJson(
            response,
            503,
            { error: { code: 'UNAVAILABLE', message: 'Marketplace commands are disabled.' } },
            mode,
          );
          return;
        }

        const actor = request.headers['x-pubky-actor'];
        if (Array.isArray(actor) || actor === undefined) {
          writeJson(
            response,
            401,
            { error: { code: 'UNAUTHORIZED', message: 'A sandbox actor header is required.' } },
            mode,
          );
          return;
        }

        const body = await readJsonBody(request, maxBodyBytes);
        const result = await service.execute(actor, body);
        const status = result.ok ? 200 : statusForFailure(result.error.code);
        writeJson(response, status, result, mode);
        return;
      }

      writeJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } }, mode);
    } catch (error) {
      const code = error instanceof RequestBodyError ? error.code : 'INTERNAL_ERROR';
      const status = error instanceof RequestBodyError ? error.status : 500;
      const message = error instanceof RequestBodyError ? error.message : 'Marketplace request failed.';
      writeJson(response, status, { error: { code, message } }, mode);
    }
  });
}

class RequestBodyError extends Error {
  constructor(
    readonly code: 'INVALID_JSON' | 'BODY_TOO_LARGE',
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readJsonBody(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maxBodyBytes) {
      throw new RequestBodyError('BODY_TOO_LARGE', 413, 'Request body is too large.');
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestBodyError('INVALID_JSON', 400, 'Request body must be valid JSON.');
  }
}

function writeJson(response: ServerResponse, status: number, body: object, mode: MarketplaceServerMode): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-marketplace-mode': mode,
  });
  response.end(JSON.stringify(body));
}

function statusForFailure(code: string): number {
  switch (code) {
    case 'INVALID_COMMAND':
      return 400;
    case 'UNAUTHORIZED':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'REVISION_CONFLICT':
    case 'IDEMPOTENCY_CONFLICT':
    case 'INSUFFICIENT_INVENTORY':
    case 'INVARIANT_VIOLATION':
    case 'INVALID_STATE':
    case 'BID_TOO_LOW':
      return 409;
    case 'OFFER_EXPIRED':
    case 'AUCTION_CLOSED':
      return 410;
    default:
      return 500;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode: MarketplaceServerMode = process.env.MARKETPLACE_MODE === 'sandbox' ? 'sandbox' : 'disabled';
  const port = Number.parseInt(process.env.MARKETPLACE_PORT ?? '3100', 10);
  const host = process.env.MARKETPLACE_HOST ?? '127.0.0.1';
  const server = createMarketplaceHttpServer({ mode });
  server.listen(port, host, () => {
    console.info(`[marketplace] listening on ${host}:${port} (${mode})`);
  });
}
