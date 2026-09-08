import { Keypair } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, ClientErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import * as deviceKey from '@/libs/pubchi/device-key';
import {
  PENDING_DELEGATION_DELETES_KEY,
  readPendingDelegationDeletes,
  rememberPendingDelegationDeletes,
} from '@/libs/pubchi/pending-delegation-deletes';
import { delegationUri, ERROR_CODES, type ErrorCode, parseQueryResultV1 } from '@/libs/pubchi/schemas';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { toast } from '@/molecules/Toaster/toast';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPubchiBindingService } from '@/services/local/pubchi/binding';
import { PubchiService } from '@/services/pubchi/pubchi';
import {
  assertDeviceSignerIsPubkyId,
  assertRequestSignerIsStoredDevice,
  deleteDelegationRecord,
  isDrainTimeout,
  listKnownDelegations,
  PUBCHI_DELEGATION_DELETE_TIMEOUT_MS,
  PubchiApplication,
} from './pubchi';

vi.mock('@/molecules/Toaster/toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/libs/pubchi/device-key', () => {
  const signer = Keypair.random().publicKey.z32();
  const deviceKeyPromise = crypto.subtle
    .generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
    .then((pair) => ({ key: (pair as CryptoKeyPair).privateKey, signer }));
  const get = async () => {
    const { key } = await deviceKeyPromise;
    return { key, signer, id: `test:${signer}`, owner: 'owner', created_at: 1, expires_at: 2_000_000_000 };
  };
  return {
    getCurrentDeviceKey: get,
    loadOrGenerateDeviceKey: get,
    getDeviceKeys: async () => [],
    wipeDeviceKeysNotOwnedBy: async () => 0,
    deleteDeviceKey: async () => undefined,
    signWithDeviceKey: async (key: CryptoKey, message: Uint8Array) =>
      Array.from(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, new Uint8Array(message))), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
  };
});

const sessionCapabilities = { current: ['/pub/pubchi.app/:rw'] as string[] };

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: () => ({
      selectSession: () => ({ info: { capabilities: sessionCapabilities.current } }),
    }),
  },
}));

const keypair = Keypair.random();
const OWNER = keypair.publicKey.z32();
const BOT = OWNER;

const ACTIVE_BINDING = {
  schema: 'pubchi-owner-binding' as const,
  version: 1 as const,
  owner: OWNER,
  bot: BOT,
  status: 'active' as const,
  created_at: 1,
  updated_at: 1,
  id: `${OWNER}:${BOT}`,
};

const QUERY_RESULT = {
  schema: 'pubchi-query-result',
  version: 1,
  bot: BOT,
  owner: OWNER,
  generated_at: 10,
  run_id: 'run1',
  purpose: 'who-tagged-me',
  scope_owner: OWNER,
  items: [
    {
      label: 'builder',
      source_uri: `pubky://${OWNER}/pub/pubky.app/tags/builder`,
      subject_uri: `pubky://${OWNER}/pub/pubky.app/profile.json`,
      claimant_count: 2,
    },
  ],
  tool_trace_summary: { tools: ['get_tag_landscape'], call_count: 1, truncated: false },
  policy_version: 1,
};

function setPubchiEnv(enabled = 'true', apiUrl = 'https://pubchi.example.com') {
  process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = enabled;
  process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = apiUrl;
  resetRuntimeConfigForTests();
}

describe('PubchiApplication', () => {
  beforeEach(() => {
    sessionCapabilities.current = ['/pub/pubchi.app/:rw'];
    setPubchiEnv();
    vi.spyOn(LocalPubchiBindingService, 'readActive').mockResolvedValue(ACTIVE_BINDING);
    vi.spyOn(LocalPubchiBindingService, 'read').mockResolvedValue(ACTIVE_BINDING);
    vi.spyOn(LocalPubchiBindingService, 'upsert').mockResolvedValue(ACTIVE_BINDING);
    vi.spyOn(LocalPubchiBindingService, 'delete').mockResolvedValue(undefined);
    vi.spyOn(LocalPubchiBindingService, 'deleteNotOwnedBy').mockResolvedValue(0);
    vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    vi.mocked(toast).mockClear();
    localStorage.removeItem(PENDING_DELEGATION_DELETES_KEY);
  });

  afterEach(() => {
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl];
    resetRuntimeConfigForTests();
    localStorage.removeItem(PENDING_DELEGATION_DELETES_KEY);
    vi.restoreAllMocks();
  });

  it('returns a parsed query result on the happy path', async () => {
    expect(parseQueryResultV1(QUERY_RESULT).ok).toBe(true);
    const querySpy = vi.spyOn(PubchiService, 'query').mockResolvedValue(QUERY_RESULT);

    const result = await PubchiApplication.query({
      owner: OWNER,
      question: 'who tagged me?',
      purpose: 'who-tagged-me',
      nowSeconds: 100,
    });

    expect(result.kind).toBe('query');
    expect(querySpy).toHaveBeenCalledOnce();
    const payload = querySpy.mock.calls[0][0];
    expect(payload.request.asker).toBe(OWNER);
    expect(payload.request.signer).toMatch(/^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/);
    expect(payload.request.bot).toBe(BOT);
    expect(payload.request.purpose).toBe('who-tagged-me');
    expect(payload.body).toEqual({ question: 'who tagged me?' });
  });

  it.each(ERROR_CODES)('surfaces error code %s and renders nothing else', async (code: ErrorCode) => {
    vi.spyOn(PubchiService, 'query').mockResolvedValue({ code });
    await expect(
      PubchiApplication.query({
        owner: OWNER,
        question: 'who tagged me?',
        purpose: 'who-tagged-me',
        nowSeconds: 100,
      }),
    ).rejects.toThrow(code);
  });

  it('rejects a malformed response', async () => {
    vi.spyOn(PubchiService, 'query').mockResolvedValue({ hello: 'world' });
    await expect(
      PubchiApplication.query({
        owner: OWNER,
        question: 'who tagged me?',
        purpose: 'who-tagged-me',
        nowSeconds: 100,
      }),
    ).rejects.toThrow('SCHEMA_INVALID');
  });

  it('does not query when the flag is off', async () => {
    setPubchiEnv('false', '');
    const querySpy = vi.spyOn(PubchiService, 'query');
    await expect(
      PubchiApplication.query({
        owner: OWNER,
        question: 'who tagged me?',
        purpose: 'who-tagged-me',
      }),
    ).rejects.toThrow('PUBCHI_DISABLED');
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('writes a validated owner binding to Dexie then the homeserver', async () => {
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');
    const requestSpy = vi.spyOn(HomeserverService, 'request');
    await PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT });
    expect(upsertSpy).toHaveBeenCalled();
    expect(requestSpy).toHaveBeenCalled();
    expect(upsertSpy.mock.invocationCallOrder[0]).toBeLessThan(requestSpy.mock.invocationCallOrder[0]);
  });

  it('accepts a feed proposal so the panel can show Apply', async () => {
    const feedProposal = {
      schema: 'pubchi-feed-proposal',
      version: 1,
      bot: BOT,
      owner: OWNER,
      generated_at: 10,
      feed: {
        name: 'Builders',
        created_at: 10,
        feed: {
          tags: ['builder'],
          reach: 'following',
          layout: 'columns',
          sort: 'recent',
        },
      },
      warnings: [],
      installed_user_feed_id: null,
    };
    vi.spyOn(PubchiService, 'query').mockResolvedValue(feedProposal);
    const result = await PubchiApplication.query({
      owner: OWNER,
      question: 'build a feed of builders',
      purpose: 'build-feed',
      nowSeconds: 100,
    });
    expect(result).toEqual({ kind: 'feed', result: feedProposal, applyAllowed: true });
    expect(vi.mocked(PubchiService.query).mock.calls[0][0].request.purpose).toBe('build-feed');
  });

  it.each(['what-i-missed', 'summarize'] as const)('refuses unserved purpose %s without a request', async (purpose) => {
    const querySpy = vi.spyOn(PubchiService, 'query');
    await expect(
      PubchiApplication.query({
        owner: OWNER,
        question: 'who tagged me in my feedreader?',
        purpose,
        nowSeconds: 100,
      }),
    ).rejects.toThrow('PURPOSE_UNSUPPORTED');
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('does not infer build-feed from the question text', async () => {
    vi.spyOn(PubchiService, 'query').mockResolvedValue(QUERY_RESULT);
    await PubchiApplication.query({
      owner: OWNER,
      question: 'who tagged me in my feedreader?',
      purpose: 'who-tagged-me',
      nowSeconds: 100,
    });
    expect(vi.mocked(PubchiService.query).mock.calls[0][0].request.purpose).toBe('who-tagged-me');
  });

  it('does not allow Apply for likes proposals', async () => {
    vi.spyOn(PubchiService, 'query').mockResolvedValue({
      schema: 'pubchi-feed-proposal',
      version: 1,
      bot: BOT,
      owner: OWNER,
      generated_at: 10,
      feed: {
        name: 'Likes',
        created_at: 10,
        feed: {
          tags: ['liked'],
          reach: 'likes',
          layout: 'columns',
          sort: 'recent',
        },
      },
      warnings: [],
      installed_user_feed_id: null,
    });
    const result = await PubchiApplication.query({
      owner: OWNER,
      question: 'build a feed of likes',
      purpose: 'build-feed',
      nowSeconds: 100,
    });
    expect(result).toEqual({ kind: 'feed-unsupported', code: 'FEED_UNSUPPORTED_LIKES' });
  });

  it('rejects a question longer than 500 characters', async () => {
    const querySpy = vi.spyOn(PubchiService, 'query');
    await expect(
      PubchiApplication.query({
        owner: OWNER,
        question: 'x'.repeat(501),
        purpose: 'who-tagged-me',
      }),
    ).rejects.toThrow('REQUEST_MALFORMED');
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('rolls back the Dexie row when homeserver PUT fails', async () => {
    vi.spyOn(LocalPubchiBindingService, 'read').mockResolvedValue(undefined);
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');
    const deleteSpy = vi.spyOn(LocalPubchiBindingService, 'delete');
    vi.spyOn(HomeserverService, 'request').mockRejectedValue(new Error('homeserver down'));

    await expect(PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT })).rejects.toThrow('homeserver down');
    expect(upsertSpy).toHaveBeenCalledOnce();
    expect(deleteSpy).toHaveBeenCalledWith(OWNER, BOT);
  });

  it('restores the previous Dexie row when homeserver DELETE fails', async () => {
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');
    const deleteSpy = vi.spyOn(LocalPubchiBindingService, 'delete');
    vi.spyOn(HomeserverService, 'request').mockRejectedValue(new Error('homeserver down'));

    await expect(PubchiApplication.commitDeleteBinding({ owner: OWNER, bot: BOT })).rejects.toThrow('homeserver down');
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(upsertSpy.mock.calls[1][0]).toMatchObject({ owner: OWNER, bot: BOT, status: 'active' });
  });

  it('marks the local row revoked when the homeserver binding is absent', async () => {
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(false);
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');
    await expect(PubchiApplication.reconcileActiveBinding(OWNER)).resolves.toBeUndefined();
    expect(upsertSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'revoked', owner: OWNER, bot: BOT }));
  });

  it('keeps the local row when a 200 body fails parseOwnerBindingV1', async () => {
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(true);
    vi.spyOn(HomeserverService, 'request').mockResolvedValue('<html>proxy error</html>');
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');
    await expect(PubchiApplication.reconcileActiveBinding(OWNER)).resolves.toEqual(ACTIVE_BINDING);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('does not upsert a mismatched remote bot from reconcile', async () => {
    const otherBot = Keypair.random().publicKey.z32();
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(true);
    vi.spyOn(HomeserverService, 'request').mockResolvedValue({
      schema: 'pubchi-owner-binding',
      version: 1,
      owner: OWNER,
      bot: otherBot,
      status: 'active',
      created_at: 2,
      updated_at: 2,
    });
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');
    await expect(PubchiApplication.reconcileActiveBinding(OWNER)).resolves.toEqual(ACTIVE_BINDING);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('refuses enrollment when the session lacks the Pubchi capability', async () => {
    sessionCapabilities.current = ['/pub/pubky.app/:rw'];
    const requestSpy = vi.spyOn(HomeserverService, 'request');
    const upsertSpy = vi.spyOn(LocalPubchiBindingService, 'upsert');
    await expect(PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT })).rejects.toThrow('PATH_FORBIDDEN');
    expect(requestSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('allows enrollment when the session has root /:rw', async () => {
    sessionCapabilities.current = ['/:rw'];
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    await expect(PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT })).resolves.toMatchObject({
      owner: OWNER,
      bot: BOT,
      status: 'active',
    });
    expect(requestSpy).toHaveBeenCalled();
  });

  it('allows enrollment when the session has /pub/:rw', async () => {
    sessionCapabilities.current = ['/pub/:rw'];
    await expect(PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT })).resolves.toMatchObject({
      owner: OWNER,
      bot: BOT,
      status: 'active',
    });
  });

  it('refuses enrollment for near-miss and read-only covering scopes', async () => {
    for (const capability of ['/pub/pubchi.app.evil/:rw', '/pub/pubchi.appfoo/:rw', '/:r', '/pub/pubchi.app/:r']) {
      sessionCapabilities.current = [capability];
      await expect(PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT })).rejects.toThrow('PATH_FORBIDDEN');
    }
  });

  it('rejects a request whose signer is not the stored device key', () => {
    expect(() => assertRequestSignerIsStoredDevice('b'.repeat(52), 'a'.repeat(52))).toThrow('DELEGATION_INVALID');
  });

  it('rejects a stored device signer that is not a pubky id', () => {
    expect(() => assertDeviceSignerIsPubkyId('../../pubky.app/profile', 'commitCreateBinding')).toThrow(
      'DELEGATION_INVALID',
    );
  });

  it('discards a planted Dexie signer and mints before the enrollment PUT', async () => {
    const planted = '../../pubky.app/profile';
    const deleteSpy = vi.spyOn(deviceKey, 'deleteDeviceKey').mockResolvedValue(undefined);
    vi.spyOn(deviceKey, 'loadOrGenerateDeviceKey').mockImplementationOnce(async () => ({
      id: `${OWNER}:${planted}`,
      owner: OWNER,
      signer: planted,
      key: {} as CryptoKey,
      created_at: 1,
      expires_at: 2_000_000_000,
    }));
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await PubchiApplication.commitCreateBinding({ owner: OWNER, bot: BOT });

    expect(deleteSpy).toHaveBeenCalledWith(OWNER, planted);
    const urls = requestSpy.mock.calls.map((call) => String(call[0].url));
    expect(urls.every((url) => !url.includes('..'))).toBe(true);
    expect(urls.some((url) => url.includes('/pub/pubchi.app/devices/'))).toBe(true);
  });

  it('DELETEs known delegations for a root /:rw session instead of skipping remote drain', async () => {
    sessionCapabilities.current = ['/:rw'];
    const signer = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      { id: `${OWNER}:${signer}`, owner: OWNER, signer, key: {} as CryptoKey, created_at: 1, expires_at: 2 },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    const result = await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true });
    expect(requestSpy).toHaveBeenCalledWith({
      method: 'DELETE',
      url: delegationUri(OWNER, signer),
    });
    expect(result).toEqual({ failed: [] });
  });

  it('DELETEs known delegation URIs and does not touch the owner binding', async () => {
    const signer = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      { id: `${OWNER}:${signer}`, owner: OWNER, signer, key: {} as CryptoKey, created_at: 1, expires_at: 2 },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await expect(PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true })).resolves.toEqual({
      failed: [],
    });
    expect(requestSpy).toHaveBeenCalledWith({
      method: 'DELETE',
      url: delegationUri(OWNER, signer),
    });
    expect(requestSpy.mock.calls.every((call) => !String(call[0].url).includes('/bots/'))).toBe(true);
    expect(readPendingDelegationDeletes()).toEqual([]);
  });

  it('records a failed DELETE so the next same-owner session can finish it', async () => {
    const signer = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      { id: `${OWNER}:${signer}`, owner: OWNER, signer, key: {} as CryptoKey, created_at: 1, expires_at: 2 },
    ]);
    vi.spyOn(HomeserverService, 'request').mockRejectedValue(new Error('homeserver unreachable'));

    await expect(PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true })).resolves.toEqual({
      failed: [{ owner: OWNER, signer }],
    });
    expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer }]);
  });

  it('retries a recorded DELETE for the signed-in owner during reconcile', async () => {
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: OWNER, signer }]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (input.method === 'DELETE') return undefined;
      return ACTIVE_BINDING;
    });
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(true);

    await PubchiApplication.reconcileActiveBinding(OWNER);
    expect(requestSpy).toHaveBeenCalledWith({
      method: 'DELETE',
      url: delegationUri(OWNER, signer),
    });
    expect(readPendingDelegationDeletes()).toEqual([]);
  });

  it('never DELETEs a planted path-injection signer', async () => {
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: OWNER, signer }]);
    localStorage.setItem(
      PENDING_DELEGATION_DELETES_KEY,
      JSON.stringify([
        { owner: OWNER, signer: '../../foo' },
        { owner: OWNER, signer },
      ]),
    );
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true });

    expect(requestSpy.mock.calls.every((call) => !String(call[0].url).includes('../../'))).toBe(true);
    expect(requestSpy).toHaveBeenCalledWith({
      method: 'DELETE',
      url: delegationUri(OWNER, signer),
    });
    expect(readPendingDelegationDeletes().some((item) => item.signer === '../../foo')).toBe(false);
  });

  it('bounds a never-resolving DELETE and keeps the pending record', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const signer = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      { id: `${OWNER}:${signer}`, owner: OWNER, signer, key: {} as CryptoKey, created_at: 1, expires_at: 2 },
    ]);
    vi.spyOn(HomeserverService, 'request').mockReturnValue(new Promise(() => {}));

    try {
      const result = PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true });
      await vi.advanceTimersByTimeAsync(PUBCHI_DELEGATION_DELETE_TIMEOUT_MS);
      await expect(result).resolves.toEqual({ failed: [{ owner: OWNER, signer }] });
      expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('wipes local keys from another identity and does not DELETE that identity remote delegation', async () => {
    const previousOwner = Keypair.random().publicKey.z32();
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: previousOwner, signer }]);
    const wipeSpy = vi.spyOn(deviceKey, 'wipeDeviceKeysNotOwnedBy').mockResolvedValue(1);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(true);

    await PubchiApplication.reconcileActiveBinding(OWNER);
    expect(wipeSpy).toHaveBeenCalledWith(OWNER);
    expect(requestSpy.mock.calls.some((call) => String(call[0].url) === delegationUri(previousOwner, signer))).toBe(
      false,
    );
    expect(readPendingDelegationDeletes()).toEqual([{ owner: previousOwner, signer }]);
  });

  it('does not DELETE or record the live device signer during reconcile', async () => {
    const liveSigner = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${liveSigner}`,
        owner: OWNER,
        signer: liveSigner,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2,
      },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (input.method === 'DELETE') return undefined;
      return ACTIVE_BINDING;
    });
    vi.spyOn(HomeserverService, 'exists').mockResolvedValue(true);

    await PubchiApplication.reconcileActiveBinding(OWNER);

    expect(requestSpy.mock.calls.some((call) => String(call[0].url) === delegationUri(OWNER, liveSigner))).toBe(false);
    expect(readPendingDelegationDeletes().some((item) => item.signer === liveSigner)).toBe(false);
  });

  it('retains a stored pending DELETE that names a currently-live device', async () => {
    const liveSigner = Keypair.random().publicKey.z32();
    const staleSigner = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([
      { owner: OWNER, signer: liveSigner },
      { owner: OWNER, signer: staleSigner },
    ]);
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${liveSigner}`,
        owner: OWNER,
        signer: liveSigner,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2,
      },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: false });

    expect(requestSpy.mock.calls.some((call) => String(call[0].url) === delegationUri(OWNER, liveSigner))).toBe(false);
    expect(requestSpy).toHaveBeenCalledWith({
      method: 'DELETE',
      url: delegationUri(OWNER, staleSigner),
    });
    expect(readPendingDelegationDeletes()).toEqual(expect.arrayContaining([{ owner: OWNER, signer: liveSigner }]));
    expect(readPendingDelegationDeletes().some((item) => item.signer === staleSigner)).toBe(false);
  });

  it('defers pending drain when live-device lookup fails and local keys must be preserved', async () => {
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: OWNER, signer }]);
    vi.spyOn(deviceKey, 'getDeviceKeys').mockRejectedValue(new Error('indexeddb unavailable'));
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await expect(
      PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: false }),
    ).resolves.toEqual({ failed: [{ owner: OWNER, signer }] });

    expect(requestSpy).not.toHaveBeenCalled();
    expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer }]);
  });

  it('still DELETEs the live device signer when the caller revokes local keys', async () => {
    const liveSigner = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${liveSigner}`,
        owner: OWNER,
        signer: liveSigner,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2,
      },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true });

    expect(requestSpy).toHaveBeenCalledWith({
      method: 'DELETE',
      url: delegationUri(OWNER, liveSigner),
    });
  });

  it('never DELETEs a Dexie-planted path-injection signer', async () => {
    const botTraversal = '../bots/x';
    const profileTraversal = '../../pubky.app/profile';
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${botTraversal}`,
        owner: OWNER,
        signer: botTraversal,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2_000_000_000,
      },
      {
        id: `${OWNER}:${profileTraversal}`,
        owner: OWNER,
        signer: profileTraversal,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2_000_000_000,
      },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true });

    const urls = requestSpy.mock.calls.map((call) => String(call[0].url));
    expect(urls).toEqual([]);
  });

  it('listKnownDelegations keeps a valid Dexie signer', async () => {
    const signer = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${signer}`,
        owner: OWNER,
        signer,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2_000_000_000,
      },
    ]);

    await expect(listKnownDelegations(OWNER)).resolves.toEqual({
      kind: 'ok',
      items: [{ owner: OWNER, signer }],
    });
  });

  it('listKnownDelegations drops a Dexie-planted path-injection signer', async () => {
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:../bots/x`,
        owner: OWNER,
        signer: '../bots/x',
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2_000_000_000,
      },
    ]);

    await expect(listKnownDelegations(OWNER)).resolves.toEqual({ kind: 'ok', items: [] });
  });

  it('deleteDelegationRecord DELETEs a valid signer', async () => {
    const signer = Keypair.random().publicKey.z32();
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);

    await deleteDelegationRecord({ owner: OWNER, signer });

    expect(deleteSpy).toHaveBeenCalledWith(delegationUri(OWNER, signer));
  });

  it('deleteDelegationRecord rejects a path-injection signer before the homeserver call', async () => {
    const deleteSpy = vi.spyOn(HomeserverService, 'delete').mockResolvedValue(undefined);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await expect(deleteDelegationRecord({ owner: OWNER, signer: '../../pubky.app/profile' })).rejects.toThrow(
      'INVALID_PUBKY',
    );
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('retains a live-signer pending record across the multi-tab survivor sign-in', async () => {
    const liveSigner = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${liveSigner}`,
        owner: OWNER,
        signer: liveSigner,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2,
      },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockRejectedValue(new Error('homeserver unreachable'));

    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true });
    expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer: liveSigner }]);

    requestSpy.mockClear();
    requestSpy.mockResolvedValue(undefined);
    vi.mocked(toast).mockClear();
    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: false });

    expect(requestSpy.mock.calls.some((call) => String(call[0].url) === delegationUri(OWNER, liveSigner))).toBe(false);
    expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer: liveSigner }]);
    expect(toast).not.toHaveBeenCalled();

    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([]);
    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: false });
    expect(requestSpy).toHaveBeenCalledWith({
      method: 'DELETE',
      url: delegationUri(OWNER, liveSigner),
    });
    expect(readPendingDelegationDeletes()).toEqual([]);
  });

  it('treats a 404 DELETE as success and does not retry or toast', async () => {
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: OWNER, signer }]);
    vi.spyOn(HomeserverService, 'request').mockRejectedValue(
      Err.client(ClientErrorCode.NOT_FOUND, 'Not Found', {
        service: ErrorService.Homeserver,
        operation: 'delete',
        context: { statusCode: HttpStatusCode.NOT_FOUND },
      }),
    );

    await expect(
      PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: false }),
    ).resolves.toEqual({ failed: [] });
    expect(readPendingDelegationDeletes()).toEqual([]);
    expect(toast).not.toHaveBeenCalled();
  });

  it('retains a 403 DELETE silently without toasting', async () => {
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: OWNER, signer }]);
    vi.spyOn(HomeserverService, 'request').mockRejectedValue(
      Err.auth(AuthErrorCode.FORBIDDEN, 'Forbidden', {
        service: ErrorService.Homeserver,
        operation: 'delete',
        context: { statusCode: HttpStatusCode.FORBIDDEN },
      }),
    );

    await expect(
      PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: false }),
    ).resolves.toEqual({ failed: [{ owner: OWNER, signer }] });
    expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer }]);
    expect(toast).not.toHaveBeenCalled();
  });

  it('defers the drain when a Dexie device-key read hangs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const signer = Keypair.random().publicKey.z32();
    rememberPendingDelegationDeletes([{ owner: OWNER, signer }]);
    vi.spyOn(deviceKey, 'getDeviceKeys').mockReturnValue(new Promise(() => {}));
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    const errorSpy = vi.spyOn(Logger, 'error');

    try {
      const result = PubchiApplication.unpublishKnownDelegations(OWNER, {
        attemptRemote: true,
        includeLocalKeys: false,
      });
      await vi.advanceTimersByTimeAsync(PUBCHI_DELEGATION_DELETE_TIMEOUT_MS);
      await expect(result).resolves.toEqual({ failed: [{ owner: OWNER, signer }] });
      expect(requestSpy).not.toHaveBeenCalled();
      expect(readPendingDelegationDeletes()).toEqual([{ owner: OWNER, signer }]);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(
        isDrainTimeout(
          new AppError({
            category: ErrorCategory.Timeout,
            code: TimeoutErrorCode.REQUEST_TIMEOUT,
            message: 'Pubchi device-key read timed out',
            service: ErrorService.Pubchi,
            operation: 'unpublishKnownDelegations',
          }),
        ),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('logout still revokes live device keys after retain-on-skip', async () => {
    const liveSigner = Keypair.random().publicKey.z32();
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${liveSigner}`,
        owner: OWNER,
        signer: liveSigner,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2,
      },
    ]);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await PubchiApplication.unpublishKnownDelegations(OWNER, { attemptRemote: true, includeLocalKeys: true });

    expect(requestSpy).toHaveBeenCalledWith({
      method: 'DELETE',
      url: delegationUri(OWNER, liveSigner),
    });
    expect(readPendingDelegationDeletes()).toEqual([]);
  });
});
