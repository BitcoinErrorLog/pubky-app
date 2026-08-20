import { beforeEach, describe, expect, it, vi } from 'vitest';

const CREATOR = 'y'.repeat(52);
const READER = 'b'.repeat(52);
const BUNDLE_ID = '000G40R40M30E209185GR38E1W';
const LOCK_RESOURCE = `pubky://${CREATOR}/pub/locks.app/lock.json`;
const SDK_LOCK_RESOURCE = `pubky${CREATOR}/pub/locks.app/lock.json`;

const sdkMocks = vi.hoisted(() => {
  const contentLockViewer = {
    submitProofBundle: vi.fn(),
    lookupVerificationTask: vi.fn(),
    issueAccessCredential: vi.fn(),
    completeVerificationTask: vi.fn(),
    proxyReadGuardedResource: vi.fn(),
  };
  const creatorViewer = {
    submitProofBundle: vi.fn(),
    lookupVerificationTask: vi.fn(),
    issueAccessCredential: vi.fn(),
    completeVerificationTask: vi.fn(),
    proxyReadGuardedResource: vi.fn(),
  };

  class MockLocksOptions {
    readonly relays: string[] = [];

    addPkarrRelay(relayUrl: string): MockLocksOptions {
      this.relays.push(relayUrl);
      return this;
    }
  }

  class MockVerificationTaskHandleOptions {
    constructor(
      readonly creator: string,
      readonly bundleId: string,
    ) {}
  }

  return {
    contentLockViewer,
    creatorViewer,
    contentLockClient: { viewer: contentLockViewer },
    creatorClient: { viewer: creatorViewer },
    init: vi.fn(),
    forContentLockWithOptions: vi.fn(),
    forCreatorWithOptions: vi.fn(),
    generateBundleId: vi.fn(),
    MockLocksOptions,
    MockVerificationTaskHandleOptions,
  };
});

vi.mock('locks-sdk-wasm', () => ({
  default: sdkMocks.init,
  Locks: {
    forContentLockWithOptions: sdkMocks.forContentLockWithOptions,
    forCreatorWithOptions: sdkMocks.forCreatorWithOptions,
  },
  LocksOptions: sdkMocks.MockLocksOptions,
  VerificationTaskHandleOptions: sdkMocks.MockVerificationTaskHandleOptions,
  BundleId: { generate: sdkMocks.generateBundleId },
}));

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return {
    ...actual,
    getPaykitSetupUrl: () => 'https://paykit.example.com/setup',
  };
});

vi.mock('@/config/network', async () => {
  const actual = await vi.importActual<typeof import('@/config/network')>('@/config/network');
  return {
    ...actual,
    getPkarrRelays: () => ['https://pkarr.example.com/', 'https://pkarr2.example.com/'],
  };
});

function lifecycle(status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'expired' = 'pending') {
  return {
    creator: `pubky${CREATOR}`,
    bundle_id: BUNDLE_ID,
    status,
    submitted_at: '2026-08-19T23:00:00.000Z',
    started_at: null,
    completed_at: status === 'completed' ? '2026-08-19T23:01:00.000Z' : null,
    failure_message: null,
  };
}

async function importService() {
  const { LocksGatewayService } = await import('./locks');
  return LocksGatewayService;
}

// vi.resetModules() gives each test a fresh service module, which also reloads the
// AppError class; asserting on the error's name and code avoids cross-instance
// instanceof checks.
function expectAppError(error: unknown, code: string): void {
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ name: 'AppError', code });
}

function submitParams() {
  return {
    creatorPubky: CREATOR,
    readerPubky: READER,
    bundleId: BUNDLE_ID,
    lockResource: LOCK_RESOURCE,
    criterionId: 'criterion-1',
  };
}

describe('LocksGatewayService', () => {
  beforeEach(() => {
    // The service caches the initialized SDK and resolved clients at module scope,
    // so each test starts from a fresh module instance.
    vi.resetModules();
    vi.clearAllMocks();
    sdkMocks.init.mockResolvedValue(undefined);
    sdkMocks.forContentLockWithOptions.mockResolvedValue(sdkMocks.contentLockClient);
    sdkMocks.forCreatorWithOptions.mockResolvedValue(sdkMocks.creatorClient);
    sdkMocks.generateBundleId.mockReturnValue({ toString: () => BUNDLE_ID });
  });

  it('generates bundle ids through the SDK and initializes the WASM module once', async () => {
    const service = await importService();

    await expect(service.generateBundleId()).resolves.toBe(BUNDLE_ID);
    await expect(service.generateBundleId()).resolves.toBe(BUNDLE_ID);

    expect(sdkMocks.init).toHaveBeenCalledTimes(1);
    expect(sdkMocks.generateBundleId).toHaveBeenCalledTimes(2);
  });

  it('submits the canonical empty Paykit proof through the content-lock client', async () => {
    sdkMocks.contentLockViewer.submitProofBundle.mockResolvedValue(lifecycle());
    const service = await importService();

    const result = await service.submitPaykitProof(submitParams());

    expect(sdkMocks.forContentLockWithOptions).toHaveBeenCalledTimes(1);
    const [resource, options] = sdkMocks.forContentLockWithOptions.mock.calls[0];
    expect(resource).toBe(SDK_LOCK_RESOURCE);
    expect((options as InstanceType<typeof sdkMocks.MockLocksOptions>).relays).toEqual([
      'https://pkarr.example.com/',
      'https://pkarr2.example.com/',
    ]);
    expect(sdkMocks.contentLockViewer.submitProofBundle).toHaveBeenCalledWith({
      version: 1,
      bundle_id: BUNDLE_ID,
      pubky_lock_resource: SDK_LOCK_RESOURCE,
      reader_public_key: `pubky${READER}`,
      proofs: [{ criterion_id: 'criterion-1', verifier_type: 'paykit-payment', payload: {} }],
    });
    expect(result.status).toBe('pending');
  });

  it('rejects a lock resource that is not owned by the creator without loading the SDK', async () => {
    const service = await importService();

    const error = await service
      .submitPaykitProof({ ...submitParams(), lockResource: `pubky://${READER}/pub/locks.app/lock.json` })
      .catch((thrown: unknown) => thrown);

    expectAppError(error, 'INVALID_INPUT');
    expect(sdkMocks.init).not.toHaveBeenCalled();
  });

  it('reuses the client resolved at submit time for lifecycle lookups of the same bundle', async () => {
    sdkMocks.contentLockViewer.submitProofBundle.mockResolvedValue(lifecycle());
    sdkMocks.contentLockViewer.lookupVerificationTask.mockResolvedValue(lifecycle('completed'));
    const service = await importService();

    await service.submitPaykitProof(submitParams());
    const result = await service.lookupVerification(CREATOR, BUNDLE_ID);

    expect(result.status).toBe('completed');
    expect(sdkMocks.forCreatorWithOptions).not.toHaveBeenCalled();
    const [options] = sdkMocks.contentLockViewer.lookupVerificationTask.mock.calls[0];
    expect(options).toBeInstanceOf(sdkMocks.MockVerificationTaskHandleOptions);
    expect(options).toMatchObject({ creator: `pubky${CREATOR}`, bundleId: BUNDLE_ID });
  });

  it('falls back to the creator lock service pointer when a bundle was not submitted here', async () => {
    sdkMocks.creatorViewer.lookupVerificationTask.mockResolvedValue(lifecycle('in_progress'));
    const service = await importService();

    await service.lookupVerification(CREATOR, BUNDLE_ID);
    await service.lookupVerification(CREATOR, BUNDLE_ID);

    expect(sdkMocks.forCreatorWithOptions).toHaveBeenCalledTimes(1);
    expect(sdkMocks.forCreatorWithOptions).toHaveBeenCalledWith(`pubky${CREATOR}`, expect.anything());
    expect(sdkMocks.creatorViewer.lookupVerificationTask).toHaveBeenCalledTimes(2);
  });

  it('retries client resolution after a failed creator lookup instead of caching the failure', async () => {
    sdkMocks.forCreatorWithOptions
      .mockRejectedValueOnce(new Error('creator pointer fetch failed with HTTP 502'))
      .mockResolvedValueOnce(sdkMocks.creatorClient);
    sdkMocks.creatorViewer.lookupVerificationTask.mockResolvedValue(lifecycle());
    const service = await importService();

    const firstError = await service.lookupVerification(CREATOR, BUNDLE_ID).catch((thrown: unknown) => thrown);
    const second = await service.lookupVerification(CREATOR, BUNDLE_ID);

    expectAppError(firstError, 'UNKNOWN_ERROR');
    expect(second.status).toBe('pending');
    expect(sdkMocks.forCreatorWithOptions).toHaveBeenCalledTimes(2);
  });

  it('issues access credentials and validates the response shape', async () => {
    sdkMocks.creatorViewer.issueAccessCredential.mockResolvedValue({
      credential: 'opaque-secret',
      expires_at: '2026-08-20T00:00:00.000Z',
    });
    const service = await importService();

    await expect(service.issueAccessCredential(CREATOR, BUNDLE_ID)).resolves.toMatchObject({
      credential: 'opaque-secret',
    });
  });

  it('rejects malformed lifecycle and credential responses as INVALID_RESPONSE', async () => {
    sdkMocks.creatorViewer.lookupVerificationTask.mockResolvedValue({ ...lifecycle(), status: 'not-a-status' });
    sdkMocks.creatorViewer.issueAccessCredential.mockResolvedValue({ credential: '' });
    const service = await importService();

    const lookupError = await service.lookupVerification(CREATOR, BUNDLE_ID).catch((thrown: unknown) => thrown);
    const credentialError = await service.issueAccessCredential(CREATOR, BUNDLE_ID).catch((thrown: unknown) => thrown);

    expectAppError(lookupError, 'INVALID_RESPONSE');
    expectAppError(credentialError, 'INVALID_RESPONSE');
  });

  it('wraps SDK failures in an AppError that keeps the original cause', async () => {
    const sdkFailure = new Error('Lock Server viewer request failed with HTTP 422');
    sdkMocks.contentLockViewer.submitProofBundle.mockRejectedValue(sdkFailure);
    const service = await importService();

    const error = await service.submitPaykitProof(submitParams()).catch((thrown: unknown) => thrown);

    expectAppError(error, 'UNKNOWN_ERROR');
    expect((error as { cause?: unknown }).cause).toBe(sdkFailure);
  });

  it('reads guarded content through the SDK proxy and returns the bytes as a Blob', async () => {
    sdkMocks.creatorViewer.proxyReadGuardedResource.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const service = await importService();

    const blob = await service.fetchGuardedContent({
      creatorPubky: CREATOR,
      bundleId: BUNDLE_ID,
      relativePath: 'orders/proof image.jpg',
      credential: 'opaque-secret',
    });

    expect(sdkMocks.creatorViewer.proxyReadGuardedResource).toHaveBeenCalledWith(
      'opaque-secret',
      'orders/proof image.jpg',
    );
    expect(blob.size).toBe(3);
  });

  it('builds exact-origin Paykit setup callbacks', async () => {
    const service = await importService();

    expect(service.buildPaykitSetupUrl('https://app.example.com/marketplace/settings', 'opaque-state')).toBe(
      'https://paykit.example.com/setup?return_to=https%3A%2F%2Fapp.example.com%2Fmarketplace%2Fsettings&state=opaque-state',
    );
  });
});
