// Type-only imports are erased at compile time; the WASM module itself is only ever
// loaded through the dynamic import in loadLocksSdk(), never at module scope, so this
// file stays safe to pull into server-rendered module graphs.
import type { Locks as LocksSdkClient, LocksOptions } from 'locks-sdk-wasm';
import { z } from 'zod';
import { getPaykitSetupUrl } from '@/config/commerce';
import { getPkarrRelays } from '@/config/network';
import { isAppError } from '@/libs/error/error';
import { ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

type LocksSdkModule = typeof import('locks-sdk-wasm');

const lifecycleSchema = z.object({
  creator: z.string().min(1),
  bundle_id: z.string().min(1).max(128),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'expired']),
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

let sdkModulePromise: Promise<LocksSdkModule> | null = null;

/**
 * Loads and initializes the vendored Locks SDK WASM module exactly once. The dynamic
 * import keeps the ~1.2 MB WASM binary out of every server-rendered and initial-client
 * module graph; it is only fetched when a Locks operation actually runs in the browser.
 */
async function loadLocksSdk(): Promise<LocksSdkModule> {
  sdkModulePromise ??= (async () => {
    const sdk = await import('locks-sdk-wasm');
    await sdk.default();
    return sdk;
  })();
  try {
    return await sdkModulePromise;
  } catch (error) {
    // A failed WASM fetch/instantiation must stay retryable on the next call.
    sdkModulePromise = null;
    throw error;
  }
}

function buildLocksOptions(sdk: LocksSdkModule): LocksOptions {
  let options = new sdk.LocksOptions();
  for (const relay of getPkarrRelays()) {
    options = options.addPkarrRelay(relay);
  }
  return options;
}

// The Lock Server for a bundle is fixed at submit time (the content lock may override
// the creator's default server), so submitted bundles remember their resolved client
// and later lifecycle calls reuse it instead of re-resolving through pkarr.
const bundleClients = new Map<string, Promise<LocksSdkClient>>();
const creatorClients = new Map<string, Promise<LocksSdkClient>>();

function bundleKey(creatorPubky: string, bundleId: string): string {
  return `${creatorPubky}:${bundleId}`;
}

function toLocksError(error: unknown, operation: string): unknown {
  if (isAppError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  return Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Locks SDK call failed.', {
    service: ErrorService.Locks,
    operation,
    cause: error,
    context: { message },
  });
}

function parseLifecycle(raw: unknown, operation: string): LocksVerificationLifecycle {
  const parsed = lifecycleSchema.safeParse(raw);
  if (!parsed.success) {
    throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Locks returned an invalid lifecycle response.', {
      service: ErrorService.Locks,
      operation,
    });
  }
  return parsed.data;
}

export class LocksGatewayService {
  private constructor() {}

  /**
   * Generates a canonical Locks bundle id through the SDK. Bundle ids are Crockford
   * base32 identifiers validated by the Lock Server; callers must never mint their own.
   */
  static async generateBundleId(): Promise<string> {
    try {
      const sdk = await loadLocksSdk();
      return sdk.BundleId.generate().toString();
    } catch (error) {
      throw toLocksError(error, 'generateBundleId');
    }
  }

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
    if (!lockResource.startsWith(`pubky://${creatorPubky}/`)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Locks resource owner does not match the creator.', {
        service: ErrorService.Locks,
        operation: 'submitPaykitProof',
        context: { ownerMatches: false },
      });
    }
    try {
      const sdk = await loadLocksSdk();
      const clientPromise = sdk.Locks.forContentLockWithOptions(toLocksResource(lockResource), buildLocksOptions(sdk));
      const client = await clientPromise;
      const raw = await client.viewer.submitProofBundle({
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
      });
      const lifecycle = parseLifecycle(raw, 'submitPaykitProof');
      // The SDK canonicalizes bundle ids, so record the client under both the caller's
      // form and the canonical response form.
      bundleClients.set(bundleKey(creatorPubky, lifecycle.bundle_id), clientPromise);
      bundleClients.set(bundleKey(creatorPubky, bundleId), clientPromise);
      return lifecycle;
    } catch (error) {
      throw toLocksError(error, 'submitPaykitProof');
    }
  }

  static async lookupVerification(creatorPubky: string, bundleId: string): Promise<LocksVerificationLifecycle> {
    try {
      const sdk = await loadLocksSdk();
      const client = await this.clientForBundle(sdk, creatorPubky, bundleId);
      const raw = await client.viewer.lookupVerificationTask(
        new sdk.VerificationTaskHandleOptions(withPubkyPrefix(creatorPubky), bundleId),
      );
      return parseLifecycle(raw, 'lookupVerification');
    } catch (error) {
      throw toLocksError(error, 'lookupVerification');
    }
  }

  static async issueAccessCredential(creatorPubky: string, bundleId: string): Promise<LocksAccessCredential> {
    try {
      const sdk = await loadLocksSdk();
      const client = await this.clientForBundle(sdk, creatorPubky, bundleId);
      const raw = await client.viewer.issueAccessCredential(
        new sdk.VerificationTaskHandleOptions(withPubkyPrefix(creatorPubky), bundleId),
      );
      const parsed = accessCredentialSchema.safeParse(raw);
      if (!parsed.success) {
        throw Err.server(ServerErrorCode.INVALID_RESPONSE, 'Locks returned an invalid access credential response.', {
          service: ErrorService.Locks,
          operation: 'issueAccessCredential',
        });
      }
      return parsed.data;
    } catch (error) {
      throw toLocksError(error, 'issueAccessCredential');
    }
  }

  static async fetchGuardedContent({
    creatorPubky,
    bundleId,
    relativePath,
    credential,
  }: {
    creatorPubky: string;
    bundleId: string;
    relativePath: string;
    credential: string;
  }): Promise<Blob> {
    try {
      const sdk = await loadLocksSdk();
      const client = await this.clientForBundle(sdk, creatorPubky, bundleId);
      // The SDK owns content-path encoding and keeps the credential in the
      // authorization header only.
      const bytes = await client.viewer.proxyReadGuardedResource(credential, relativePath);
      // slice() copies the bytes out of WASM linear memory, which can be detached
      // when the module's memory grows.
      return new Blob([bytes.slice()]);
    } catch (error) {
      throw toLocksError(error, 'fetchGuardedContent');
    }
  }

  static buildPaykitSetupUrl(returnTo: string, state: string): string {
    const url = new URL(getPaykitSetupUrl());
    url.searchParams.set('return_to', returnTo);
    url.searchParams.set('state', state);
    return url.toString();
  }

  /**
   * Resolves the Locks client that owns a bundle: the client recorded at submit time
   * when available, otherwise the creator's default Lock Server via the creator's
   * lock service pointer (resolved by the SDK through pkarr).
   */
  private static async clientForBundle(
    sdk: LocksSdkModule,
    creatorPubky: string,
    bundleId: string,
  ): Promise<LocksSdkClient> {
    const submitted = bundleClients.get(bundleKey(creatorPubky, bundleId));
    if (submitted) return await submitted;

    const cached = creatorClients.get(creatorPubky);
    if (cached) return await cached;

    const pending = sdk.Locks.forCreatorWithOptions(withPubkyPrefix(creatorPubky), buildLocksOptions(sdk));
    creatorClients.set(creatorPubky, pending);
    try {
      return await pending;
    } catch (error) {
      creatorClients.delete(creatorPubky);
      throw error;
    }
  }
}

function withPubkyPrefix(pubky: string): string {
  return pubky.startsWith('pubky') ? pubky : `pubky${pubky}`;
}

/**
 * Maps the app's `pubky://<creator>/...` URI form to the SDK's `pubky<creator>/...`
 * resource form. The SDK validates and canonicalizes the resource itself.
 */
function toLocksResource(resource: string): string {
  return resource.startsWith('pubky://') ? `pubky${resource.slice('pubky://'.length)}` : resource;
}
