import { AuthErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { extractPubchiErrorCode, pubchiValidationError } from '@/libs/pubchi/errors';
import { isPubchiEnabled, isPubchiPanelEnabled, pubchiEndpointFor } from '@/libs/pubchi/flags';
import {
  bodySha256,
  ownerBindingUri,
  parseFeedProposalV1,
  parseOwnerBindingV1,
  parseQueryResultV1,
  type Phase0Purpose,
  REQUEST_TTL_SECONDS,
  signRequestObjectV1,
  type UnsignedRequestObjectV1,
} from '@/libs/pubchi/schemas';
import { bindingRecordId } from '@/models/pubchi/binding.schema';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPubchiBindingService } from '@/services/local/pubchi/binding';
import { PubchiService } from '@/services/pubchi/pubchi';
import type {
  PubchiAskBody,
  PubchiBindingRecordResult,
  PubchiBindingWriteParams,
  PubchiQueryApplicationParams,
  PubchiQuerySuccess,
} from './pubchi.types';

function inferPurpose(question: string): Phase0Purpose {
  const q = question.toLowerCase();
  if (q.includes('feed')) return 'build-feed';
  if (q.includes('missed')) return 'what-i-missed';
  if (q.includes('summar')) return 'summarize';
  return 'who-tagged-me';
}

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class PubchiApplication {
  private constructor() {}

  static async getActiveBinding(owner: string): Promise<PubchiBindingRecordResult | undefined> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'getActiveBinding',
      });
    }
    return LocalPubchiBindingService.readActive(owner);
  }

  static async commitCreateBinding(params: PubchiBindingWriteParams): Promise<PubchiBindingRecordResult> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'commitCreateBinding',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const existing = await LocalPubchiBindingService.read(params.owner, params.bot);
    const createdAt = existing?.created_at ?? now;
    const candidate = {
      schema: 'pubchi-owner-binding' as const,
      version: 1 as const,
      owner: params.owner,
      bot: params.bot,
      status: 'active' as const,
      created_at: createdAt,
      updated_at: now,
    };
    const parsed = parseOwnerBindingV1(candidate);
    if (!parsed.ok) throw pubchiValidationError(parsed.code, 'commitCreateBinding');

    const record = { ...parsed.value, id: bindingRecordId(params.owner, params.bot) };
    await LocalPubchiBindingService.upsert(record);

    await HomeserverService.request({
      method: HttpMethod.PUT,
      url: ownerBindingUri(params.owner, params.bot),
      bodyJson: parsed.value,
    });

    return parsed.value;
  }

  static async commitDeleteBinding(params: PubchiBindingWriteParams): Promise<void> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'commitDeleteBinding',
      });
    }

    const existing = await LocalPubchiBindingService.read(params.owner, params.bot);
    const now = Math.floor(Date.now() / 1000);
    const revoked = {
      schema: 'pubchi-owner-binding' as const,
      version: 1 as const,
      owner: params.owner,
      bot: params.bot,
      status: 'revoked' as const,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    const parsed = parseOwnerBindingV1(revoked);
    if (!parsed.ok) throw pubchiValidationError(parsed.code, 'commitDeleteBinding');

    await LocalPubchiBindingService.upsert({ ...parsed.value, id: bindingRecordId(params.owner, params.bot) });
    await HomeserverService.request({
      method: HttpMethod.DELETE,
      url: ownerBindingUri(params.owner, params.bot),
    });
    await LocalPubchiBindingService.delete(params.owner, params.bot);
  }

  static async query(params: PubchiQueryApplicationParams): Promise<PubchiQuerySuccess> {
    if (!isPubchiPanelEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'query',
      });
    }

    const binding = await LocalPubchiBindingService.readActive(params.owner);
    if (!binding || binding.status !== 'active') {
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'BOT_MISMATCH', {
        service: ErrorService.Pubchi,
        operation: 'query',
      });
    }

    const question = params.question.trim();
    if (!question) {
      throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'REQUEST_MALFORMED', {
        service: ErrorService.Pubchi,
        operation: 'query',
      });
    }

    const purpose = inferPurpose(question);
    if (!pubchiEndpointFor(purpose)) {
      throw pubchiValidationError('PURPOSE_UNSUPPORTED', 'query');
    }

    const body: PubchiAskBody = { question };
    const issuedAt = params.nowSeconds ?? Math.floor(Date.now() / 1000);
    const unsigned: UnsignedRequestObjectV1 = {
      schema: 'pubchi-request-object',
      version: 1,
      asker: params.owner,
      bot: binding.bot,
      purpose,
      body_sha256: await bodySha256(body),
      issued_at: issuedAt,
      expires_at: issuedAt + REQUEST_TTL_SECONDS,
      nonce: randomNonce(),
    };
    const request = await signRequestObjectV1(unsigned, params.secretSeed);

    const response = await PubchiService.query({ request, body });
    return interpretQueryResponse(response);
  }
}

function interpretQueryResponse(response: unknown): PubchiQuerySuccess {
  const schema = responseSchema(response);
  if (schema === 'pubchi-query-result') {
    const query = parseQueryResultV1(response);
    if (query.ok) return { kind: 'query', result: query.value };
    throw pubchiValidationError(query.code, 'query');
  }
  if (schema === 'pubchi-feed-proposal') {
    const feed = parseFeedProposalV1(response);
    if (feed.ok) return { kind: 'feed', result: feed.value, applyAllowed: true };
    if (
      feed.code === 'FEED_UNSUPPORTED_LIKES' ||
      feed.code === 'FEED_UNSUPPORTED_REACH' ||
      feed.code === 'FEED_SPECS_INVALID'
    ) {
      return { kind: 'feed-unsupported', code: feed.code };
    }
    throw pubchiValidationError(feed.code, 'query');
  }

  const code = extractPubchiErrorCode(response) ?? 'SCHEMA_INVALID';
  throw pubchiValidationError(code, 'query');
}

function responseSchema(response: unknown): string | undefined {
  if (response === null || typeof response !== 'object' || Array.isArray(response)) return undefined;
  const schema = (response as { schema?: unknown }).schema;
  return typeof schema === 'string' ? schema : undefined;
}
