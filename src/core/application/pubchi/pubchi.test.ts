import { Keypair } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES, type ErrorCode, parseQueryResultV1, signRequestObjectV1 } from '@/libs/pubchi/schemas';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPubchiBindingService } from '@/services/local/pubchi/binding';
import { PubchiService } from '@/services/pubchi/pubchi';
import { PubchiApplication } from './pubchi';

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
    setPubchiEnv();
    vi.spyOn(LocalPubchiBindingService, 'readActive').mockResolvedValue(ACTIVE_BINDING);
    vi.spyOn(LocalPubchiBindingService, 'read').mockResolvedValue(ACTIVE_BINDING);
    vi.spyOn(LocalPubchiBindingService, 'upsert').mockResolvedValue(ACTIVE_BINDING);
    vi.spyOn(LocalPubchiBindingService, 'delete').mockResolvedValue(undefined);
    vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl];
    resetRuntimeConfigForTests();
    vi.restoreAllMocks();
  });

  it('returns a parsed query result on the happy path', async () => {
    expect(parseQueryResultV1(QUERY_RESULT).ok).toBe(true);
    const querySpy = vi.spyOn(PubchiService, 'query').mockResolvedValue(QUERY_RESULT);

    const result = await PubchiApplication.query({
      owner: OWNER,
      question: 'who tagged me?',
      purpose: 'who-tagged-me',
      secretSeed: keypair.secret(),
      nowSeconds: 100,
    });

    expect(result.kind).toBe('query');
    expect(querySpy).toHaveBeenCalledOnce();
    const payload = querySpy.mock.calls[0][0];
    expect(payload.request.asker).toBe(OWNER);
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
        secretSeed: keypair.secret(),
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
        secretSeed: keypair.secret(),
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
        secretSeed: keypair.secret(),
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
      secretSeed: keypair.secret(),
      nowSeconds: 100,
    });
    expect(result).toEqual({ kind: 'feed', result: feedProposal, applyAllowed: true });
    expect(vi.mocked(PubchiService.query).mock.calls[0][0].request.purpose).toBe('build-feed');
  });

  it.each(['what-i-missed', 'summarize'] as const)(
    'refuses unserved purpose %s without a request',
    async (purpose) => {
      const querySpy = vi.spyOn(PubchiService, 'query');
      await expect(
        PubchiApplication.query({
          owner: OWNER,
          question: 'who tagged me in my feedreader?',
          purpose,
          secretSeed: keypair.secret(),
          nowSeconds: 100,
        }),
      ).rejects.toThrow('PURPOSE_UNSUPPORTED');
      expect(querySpy).not.toHaveBeenCalled();
    },
  );

  it('does not infer build-feed from the question text', async () => {
    vi.spyOn(PubchiService, 'query').mockResolvedValue(QUERY_RESULT);
    await PubchiApplication.query({
      owner: OWNER,
      question: 'who tagged me in my feedreader?',
      purpose: 'who-tagged-me',
      secretSeed: keypair.secret(),
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
      secretSeed: keypair.secret(),
      nowSeconds: 100,
    });
    expect(result).toEqual({ kind: 'feed-unsupported', code: 'FEED_UNSUPPORTED_LIKES' });
  });

  it('signs with the user seed so the asker signature verifies', async () => {
    vi.spyOn(PubchiService, 'query').mockResolvedValue(QUERY_RESULT);
    const seed = keypair.secret();
    await PubchiApplication.query({
      owner: OWNER,
      question: 'who tagged me?',
      purpose: 'who-tagged-me',
      secretSeed: seed,
      nowSeconds: 50,
    });
    const payload = vi.mocked(PubchiService.query).mock.calls[0][0];
    const resigned = await signRequestObjectV1(
      {
        schema: payload.request.schema,
        version: payload.request.version,
        asker: payload.request.asker,
        bot: payload.request.bot,
        purpose: payload.request.purpose,
        body_sha256: payload.request.body_sha256,
        issued_at: payload.request.issued_at,
        expires_at: payload.request.expires_at,
        nonce: payload.request.nonce,
      },
      seed,
    );
    expect(resigned.signature).toBe(payload.request.signature);
  });

  it('rejects a question longer than 500 characters', async () => {
    const querySpy = vi.spyOn(PubchiService, 'query');
    await expect(
      PubchiApplication.query({
        owner: OWNER,
        question: 'x'.repeat(501),
        purpose: 'who-tagged-me',
        secretSeed: keypair.secret(),
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
});
