import { z } from 'zod';
import { getLocksUrl, getPaykitSetupUrl } from '@/config/commerce';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpResponseToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';

const lifecycleSchema = z.object({
  creator: z.string().min(1),
  bundle_id: z.string().min(16).max(128),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  submitted_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  failure_message: z.string().nullable(),
});

const accessCredentialSchema = z.object({
  credential: z.string().min(1),
  expires_at: z.string(),
});

export type LocksVerificationLifecycle = z.infer<typeof lifecycleSchema>;
export type LocksAccessCredential = z.infer<typeof accessCredentialSchema>;

export class LocksGatewayService {
  private constructor() {}

  static async submitPaykitProof({
    creatorPubky,
    readerPubky,
    bundleId,
    lockResource,
    criterionId,
  }: {
    creatorPubky: string;
    readerPubky: string;
    bundleId: string;
    lockResource: string;
    criterionId: string;
  }): Promise<LocksVerificationLifecycle> {
    const url = `${getLocksUrl()}/proof-bundles`;
    return await this.postLifecycle(url, {
      submitted_proof_bundle: {
        version: 1,
        bundle_id: bundleId,
        pubky_lock_resource: toLocksResource(lockResource),
        reader_public_key: withPubkyPrefix(readerPubky),
        proofs: [
          {
            criterion_id: criterionId,
            verifier_type: 'paykit-payment',
            payload: {},
          },
        ],
      },
    });
  }

  static async lookupVerification(creatorPubky: string, bundleId: string): Promise<LocksVerificationLifecycle> {
    const url = `${getLocksUrl()}/verification-task-lookups`;
    return await this.postLifecycle(url, {
      creator: withPubkyPrefix(creatorPubky),
      bundle_id: bundleId,
    });
  }

  static async issueAccessCredential(creatorPubky: string, bundleId: string): Promise<LocksAccessCredential> {
    const url = `${getLocksUrl()}/access-credentials`;
    const response = await safeFetch(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creator: withPubkyPrefix(creatorPubky), bundle_id: bundleId }),
      },
      ErrorService.Locks,
      'issueAccessCredential',
    );
    if (!response.ok) throw httpResponseToError(response, ErrorService.Locks, 'issueAccessCredential', url);
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Locks, 'issueAccessCredential', url);
    const parsed = accessCredentialSchema.safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Locks returned an invalid access credential response.', {
        service: ErrorService.Locks,
        operation: 'issueAccessCredential',
        context: { statusCode: response.status },
      });
    }
    return parsed.data;
  }

  static async fetchGuardedContent(relativePath: string, credential: string): Promise<Blob> {
    const safePath = relativePath
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const url = `${getLocksUrl()}/priv-resources/content/${safePath}`;
    const response = await safeFetch(
      url,
      { method: 'GET', headers: { authorization: `Bearer ${credential}` } },
      ErrorService.Locks,
      'fetchGuardedContent',
    );
    if (!response.ok) throw httpResponseToError(response, ErrorService.Locks, 'fetchGuardedContent', url);
    return await response.blob();
  }

  static buildPaykitSetupUrl(returnTo: string, state: string): string {
    const url = new URL(getPaykitSetupUrl());
    url.searchParams.set('return_to', returnTo);
    url.searchParams.set('state', state);
    return url.toString();
  }

  private static async postLifecycle(url: string, body: Record<string, unknown>): Promise<LocksVerificationLifecycle> {
    const response = await safeFetch(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      ErrorService.Locks,
      'postLifecycle',
    );
    if (!response.ok) throw httpResponseToError(response, ErrorService.Locks, 'postLifecycle', url);
    const raw = await parseResponseOrThrow<unknown>(response, ErrorService.Locks, 'postLifecycle', url);
    const parsed = lifecycleSchema.safeParse(raw);
    if (!parsed.success) {
      throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Locks returned an invalid lifecycle response.', {
        service: ErrorService.Locks,
        operation: 'postLifecycle',
        context: { statusCode: response.status },
      });
    }
    return parsed.data;
  }
}

function withPubkyPrefix(pubky: string): string {
  return pubky.startsWith('pubky') ? pubky : `pubky${pubky}`;
}

function toLocksResource(resource: string): string {
  return resource.startsWith('pubky://') ? `pubky${resource.slice('pubky://'.length)}` : resource;
}
