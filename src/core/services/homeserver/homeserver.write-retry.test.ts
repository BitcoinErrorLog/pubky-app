import type { Session } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpMethod } from '@/libs/http/http.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { CommerceHomeserverService } from './commerce/commerce';
import { HomeserverService } from './homeserver';
import { installHomeserverWriteRetryDependenciesForTests } from './write-retry';

const mockState = vi.hoisted(() => ({
  currentSession: null as Session | null,
  putJson: vi.fn(),
  putBytes: vi.fn(),
  delete: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: () => ({
      selectSession: () => mockState.currentSession,
    }),
  },
}));

vi.mock('@synonymdev/pubky', () => {
  const createSdk = () => ({
    client: { fetch: (...args: unknown[]) => mockState.fetch(...args) },
    publicStorage: { get: vi.fn(), exists: vi.fn(), list: vi.fn() },
  });
  const MockPubky = vi.fn().mockImplementation(createSdk);
  // @ts-expect-error testnet is a static constructor on the SDK class
  MockPubky.testnet = vi.fn().mockImplementation(createSdk);
  return { Pubky: MockPubky, Client: vi.fn(), resolvePubky: (url: string) => url };
});

const LISTING_URL = 'pubky://user/pub/pubky.app/marketplace/v1/listings/boots';
const PROFILE_URL = 'pubky://user/pub/pubky.app/profile.json';
const MUTE_URL = 'pubky://user/pub/pubky.app/mutes/mutee';

function session(): Session {
  return asOpaque<Session>({
    info: { publicKey: { z32: () => 'user' } },
    storage: {
      putJson: (...args: unknown[]) => mockState.putJson(...args),
      putBytes: (...args: unknown[]) => mockState.putBytes(...args),
      delete: (...args: unknown[]) => mockState.delete(...args),
      get: vi.fn(),
      exists: vi.fn(),
      list: vi.fn(),
    },
  });
}

function requestError(statusCode: number, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`Request failed: Server responded with an error: ${statusCode}`), {
    name: 'RequestError',
    data: { statusCode, ...extra },
  });
}

describe('homeserver writes route through the shared retry policy', () => {
  beforeEach(() => {
    // The SDK client is a process-wide singleton. A previous test can leave a
    // client whose fetch is not this file's mock.
    Reflect.set(HomeserverService, 'pubkySdk', null);
    mockState.currentSession = session();
    mockState.putJson.mockReset().mockResolvedValue(undefined);
    mockState.putBytes.mockReset().mockResolvedValue(undefined);
    mockState.delete.mockReset().mockResolvedValue(undefined);
    mockState.fetch.mockReset();
    installHomeserverWriteRetryDependenciesForTests({ sleep: async () => {}, random: () => 0, now: () => 0 });
  });

  afterEach(() => {
    installHomeserverWriteRetryDependenciesForTests(null);
  });

  it('retries a listing PUT on 429 with Retry-After and replays the same JSON', async () => {
    const body = { name: 'boots', price: 1 };
    mockState.putJson
      .mockRejectedValueOnce(requestError(429, { headers: new Headers({ 'retry-after': '2' }) }))
      .mockImplementationOnce(async () => {
        body.price = 9;
      });

    await CommerceHomeserverService.putJson(LISTING_URL, body);

    expect(mockState.putJson).toHaveBeenCalledTimes(2);
    expect(mockState.putJson).toHaveBeenNthCalledWith(1, '/pub/pubky.app/marketplace/v1/listings/boots', {
      name: 'boots',
      price: 1,
    });
    expect(mockState.putJson).toHaveBeenNthCalledWith(2, '/pub/pubky.app/marketplace/v1/listings/boots', {
      name: 'boots',
      price: 1,
    });
  });

  it('retries a profile PUT after 500 and does not retry a mute DELETE on 400', async () => {
    mockState.putJson.mockRejectedValueOnce(requestError(500)).mockResolvedValueOnce(undefined);
    await HomeserverService.request({
      method: HttpMethod.PUT,
      url: PROFILE_URL,
      bodyJson: { name: 'Ada' },
    });
    expect(mockState.putJson).toHaveBeenCalledTimes(2);

    mockState.delete.mockRejectedValueOnce(requestError(400));
    await expect(HomeserverService.request({ method: HttpMethod.DELETE, url: MUTE_URL })).rejects.toMatchObject({
      context: { statusCode: 400 },
    });
    expect(mockState.delete).toHaveBeenCalledTimes(1);
  });

  it('retries a 503 DELETE and then a media PUT, copying bytes per attempt', async () => {
    mockState.delete.mockRejectedValueOnce(requestError(503)).mockResolvedValueOnce(undefined);
    await CommerceHomeserverService.delete(LISTING_URL);
    expect(mockState.delete).toHaveBeenCalledTimes(2);
    expect(mockState.delete).toHaveBeenNthCalledWith(1, '/pub/pubky.app/marketplace/v1/listings/boots');
    expect(mockState.delete).toHaveBeenNthCalledWith(2, '/pub/pubky.app/marketplace/v1/listings/boots');

    const bytes = new Uint8Array([7, 8, 9]);
    const seen: Uint8Array[] = [];
    mockState.putBytes.mockImplementation(async (_path: string, body: Uint8Array) => {
      seen.push(Uint8Array.from(body));
      if (seen.length === 1) {
        body.fill(0);
        throw requestError(500);
      }
    });

    await CommerceHomeserverService.putMedia(LISTING_URL, bytes);

    expect(seen).toHaveLength(2);
    expect(Array.from(seen[0])).toEqual([7, 8, 9]);
    expect(Array.from(seen[1])).toEqual([7, 8, 9]);
    expect(seen[0]).not.toBe(seen[1]);
    expect(Array.from(bytes)).toEqual([7, 8, 9]);
  });

  it('retries a non-owned PUT when the fetch response is 429 and stops on 400', async () => {
    mockState.currentSession = null;
    const url = 'https://homeserver.example/pub/file.json';
    mockState.fetch
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '1' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: { ok: true } });
    expect(mockState.fetch).toHaveBeenCalledTimes(2);

    mockState.fetch.mockReset().mockResolvedValue(new Response(null, { status: 400 }));
    await expect(HomeserverService.request({ method: HttpMethod.DELETE, url })).rejects.toMatchObject({
      context: { statusCode: 400 },
    });
    expect(mockState.fetch).toHaveBeenCalledTimes(1);
  });
});
