import { Keypair } from '@synonymdev/pubky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPubchiDatabase } from '@/database/pubchi/pubchi';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { setBotKeyCustodyBufferObserverForTests } from '@/libs/pubchi/bot-key-custody';
import { botUri, ownerBindingUri } from '@/libs/pubchi/schemas';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPubchiBindingService } from '@/services/local/pubchi/binding';
import { PubchiApplication } from './pubchi';

const OWNER = Keypair.random().publicKey.z32();
const BOT = 'aihfhgdfshrj8nz9ofo7khayc1mgcqa4wrrdjahs5tmgo4pna3iy';
const TEST_PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const custodyMode = vi.hoisted(() => ({ real: false }));

vi.mock('@/libs/pubchi/bot-key-custody', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/pubchi/bot-key-custody')>();
  return {
    ...actual,
    mintBotKey: () => (custodyMode.real ? actual.mintBotKey() : { bot: BOT, phrase: TEST_PHRASE }),
  };
});

vi.mock('@/libs/pubchi/device-key', () => {
  const signer = Keypair.random().publicKey.z32();
  const key = crypto.subtle
    .generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
    .then((pair) => (pair as CryptoKeyPair).privateKey);
  return {
    loadOrGenerateDeviceKey: async () => ({
      key: await key,
      signer,
      id: `${OWNER}:${signer}`,
      owner: OWNER,
      created_at: 1,
      expires_at: 2_000_001,
    }),
    deleteDeviceKey: vi.fn(),
    getCurrentDeviceKey: vi.fn(),
    getDeviceKeys: vi.fn(async () => []),
    listDeviceKeysNotOwnedBy: vi.fn(async () => []),
    wipeDeviceKeysNotOwnedBy: vi.fn(async () => 0),
    signWithDeviceKey: async (privateKey: CryptoKey, bytes: Uint8Array) =>
      Array.from(new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, new Uint8Array(bytes))), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
  };
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: () => ({
      selectSession: () => ({
        info: {
          capabilities: ['/:rw'],
          publicKey: { z32: () => OWNER },
        },
      }),
    }),
  },
}));

describe('PubchiApplication create protocol', () => {
  const documents = new Map<string, unknown>();
  const operations: string[] = [];

  beforeEach(() => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    documents.clear();
    operations.length = 0;
    custodyMode.real = false;
    vi.restoreAllMocks();
    vi.spyOn(LocalPubchiBindingService, 'readActive').mockResolvedValue(undefined);
    vi.spyOn(LocalPubchiBindingService, 'upsert').mockImplementation(async (value) => value);
    vi.spyOn(HomeserverService, 'request').mockImplementation(async ({ method, url, bodyJson }) => {
      operations.push(`${method} ${url}`);
      if (method === HttpMethod.PUT) {
        documents.set(url, structuredClone(bodyJson));
        return undefined as never;
      }
      if (method === HttpMethod.GET) {
        return structuredClone(documents.get(url)) as never;
      }
      return undefined as never;
    });
  });

  it('writes and reads back binding then pointer before delegation', async () => {
    const result = await PubchiApplication.createPubchi({
      owner: OWNER,
      displayName: 'Pubchi',
      capabilities: ['/:rw'],
    });

    expect(result.bot).toBe(BOT);
    expect(operations).toEqual([
      `PUT ${ownerBindingUri(OWNER, BOT)}`,
      `GET ${ownerBindingUri(OWNER, BOT)}`,
      `PUT ${botUri(OWNER)}`,
      `GET ${botUri(OWNER)}`,
      `GET ${ownerBindingUri(OWNER, BOT)}`,
      expect.stringMatching(/^PUT pubky:\/\/.*\/pub\/pubchi\.app\/devices\/.*\.json$/),
      expect.stringMatching(/^GET pubky:\/\/.*\/pub\/pubchi\.app\/devices\/.*\.json$/),
    ]);
    const delegation = [...documents.entries()].find(([url]) => url.includes('/devices/'))?.[1] as {
      bot: string;
      purposes: string[];
    };
    expect(delegation.bot).toBe(BOT);
    expect(delegation.purposes).toEqual(['ask', 'who-tagged-me', 'build-feed']);
  });

  it('aborts before bot.json when the binding read-back mismatches', async () => {
    vi.mocked(HomeserverService.request).mockImplementation(async ({ method, url, bodyJson }) => {
      operations.push(`${method} ${url}`);
      if (method === HttpMethod.PUT) documents.set(url, structuredClone(bodyJson));
      if (method === HttpMethod.GET && url === ownerBindingUri(OWNER, BOT)) {
        return { ...(documents.get(url) as object), status: 'revoked' } as never;
      }
      return structuredClone(documents.get(url)) as never;
    });

    await expect(
      PubchiApplication.createPubchi({ owner: OWNER, displayName: 'Pubchi', capabilities: ['/:rw'] }),
    ).rejects.toThrow('SCHEMA_INVALID');
    expect(operations).not.toContain(`PUT ${botUri(OWNER)}`);
  });

  it('fails before mint and writes nothing without capability coverage', async () => {
    await expect(
      PubchiApplication.createPubchi({
        owner: OWNER,
        displayName: 'Pubchi',
        capabilities: ['/pub/pubky.app/:rw'],
      }),
    ).rejects.toThrow('PATH_FORBIDDEN');
    expect(operations).toEqual([]);
  });

  it('does not persist the bot phrase in browser storage or any Pubchi Dexie table', async () => {
    custodyMode.real = true;
    const sensitiveBuffers: Uint8Array[] = [];
    setBotKeyCustodyBufferObserverForTests((stage, buffers) => {
      if (stage === 'before-zero') sensitiveBuffers.push(...buffers.map((buffer) => Uint8Array.from(buffer)));
    });
    localStorage.setItem('unrelated', 'safe');
    sessionStorage.setItem('unrelated', 'safe');
    try {
      const created = await PubchiApplication.createPubchi({
        owner: OWNER,
        displayName: 'Pubchi',
        capabilities: ['/:rw'],
      });

      const db = getPubchiDatabase();
      const tableValues = await Promise.all(db.tables.map((table) => table.toArray()));
      const inventory = JSON.stringify({
        localStorage: { ...localStorage },
        sessionStorage: { ...sessionStorage },
        documents: [...documents.values()],
        tableValues,
      });
      expect(inventory).not.toContain(created.phrase);
      for (const buffer of sensitiveBuffers.filter((value) => value.length === 32 || value.length === 64)) {
        expect(inventory).not.toContain(Buffer.from(buffer).toString('hex'));
        expect(containsBytes(tableValues, buffer)).toBe(false);
      }
    } finally {
      setBotKeyCustodyBufferObserverForTests(undefined);
    }
  });

  it('tombstones a durable unreferenced binding before retrying creation', async () => {
    let localActive: Awaited<ReturnType<typeof LocalPubchiBindingService.readActive>>;
    let botPutFailures = 2;
    vi.mocked(LocalPubchiBindingService.readActive).mockImplementation(async () => localActive);
    vi.mocked(LocalPubchiBindingService.upsert).mockImplementation(async (value) => {
      localActive = value;
      return value;
    });
    vi.mocked(HomeserverService.request).mockImplementation(async ({ method, url, bodyJson }) => {
      operations.push(`${method} ${url}`);
      if (method === HttpMethod.PUT && url === botUri(OWNER) && botPutFailures-- > 0) {
        throw Err.server(ServerErrorCode.BAD_GATEWAY, 'UPSTREAM_UNAVAILABLE', {
          service: ErrorService.Pubchi,
          operation: 'test',
          context: { statusCode: 502 },
        });
      }
      if (method === HttpMethod.GET && url === botUri(OWNER) && !documents.has(url)) {
        throw Err.client(ClientErrorCode.NOT_FOUND, 'NOT_FOUND', {
          service: ErrorService.Pubchi,
          operation: 'test',
          context: { statusCode: 404 },
        });
      }
      if (method === HttpMethod.PUT) {
        documents.set(url, structuredClone(bodyJson));
        return undefined as never;
      }
      return structuredClone(documents.get(url)) as never;
    });

    await expect(
      PubchiApplication.createPubchi({ owner: OWNER, displayName: 'Pubchi', capabilities: ['/:rw'] }),
    ).rejects.toThrow('UPSTREAM_UNAVAILABLE');
    await expect(
      PubchiApplication.createPubchi({ owner: OWNER, displayName: 'Pubchi', capabilities: ['/:rw'] }),
    ).resolves.toMatchObject({ bot: BOT, verified: true });

    const bindingWrites = vi
      .mocked(HomeserverService.request)
      .mock.calls.filter(([call]) => call.method === HttpMethod.PUT && call.url === ownerBindingUri(OWNER, BOT))
      .map(([call]) => (call.bodyJson as { status: string }).status);
    expect(bindingWrites).toEqual(['active', 'revoked', 'active']);
  });
});

function containsBytes(value: unknown, expected: Uint8Array): boolean {
  if (value instanceof Uint8Array) {
    return value.length === expected.length && value.every((byte, index) => byte === expected[index]);
  }
  if (Array.isArray(value)) return value.some((item) => containsBytes(item, expected));
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => containsBytes(item, expected));
  }
  return false;
}
