import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestObjectV1 } from '@/libs/pubchi/schemas';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { mockResponse } from '@/test-utils/dom';
import { asOpaque } from '@/test-utils/type-assertions';
import { PubchiService } from './pubchi';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const BOT = OWNER;

const FEED_PROPOSAL = {
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

function setPubchiEnv(enabled = 'true', apiUrl = 'https://pubchi.example.com') {
  process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = enabled;
  process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = apiUrl;
  resetRuntimeConfigForTests();
}

function request(purpose: RequestObjectV1['purpose']): RequestObjectV1 {
  return {
    schema: 'pubchi-request-object',
    version: 1,
    asker: OWNER,
    bot: BOT,
    purpose,
    body_sha256: 'a'.repeat(64),
    issued_at: 1,
    expires_at: 601,
    nonce: 'b'.repeat(64),
    signature: 'c'.repeat(128),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return mockResponse({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: asOpaque<Headers>({ get: () => null }),
  });
}

describe('PubchiService', () => {
  beforeEach(() => {
    setPubchiEnv();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl];
    resetRuntimeConfigForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs who-tagged-me to /v1/query', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ schema: 'pubchi-query-result' }));
    await PubchiService.query({ request: request('who-tagged-me'), body: { question: 'who tagged me?' } });
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://pubchi.example.com/v1/query');
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe('POST');
  });

  it('POSTs build-feed to /v1/feed and returns FeedProposalV1 JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(FEED_PROPOSAL));
    const parsed = await PubchiService.query({
      request: request('build-feed'),
      body: { question: 'build a feed of builders' },
    });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://pubchi.example.com/v1/feed');
    expect(parsed).toEqual(FEED_PROPOSAL);
  });

  it.each(['what-i-missed', 'summarize'] as const)('does not send %s', async (purpose) => {
    await expect(PubchiService.query({ request: request(purpose), body: { question: purpose } })).rejects.toThrow(
      'PURPOSE_UNSUPPORTED',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
