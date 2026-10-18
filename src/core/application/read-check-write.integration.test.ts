import type { Session } from '@synonymdev/pubky';
import type { LastReadResult } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileApplication } from '@/application/profile/profile';
import { SettingsApplication } from '@/application/settings/settings';
import { NotificationController } from '@/controllers/notification/notification';
import { AuthErrorCode } from '@/libs/error/error.codes';
import type { Pubky } from '@/models/models.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import { LastReadNormalizer } from '@/pipes/lastRead/lastRead.normalizer';
import {
  HOMESERVER_PUBLISH_CONFLICT_MESSAGE,
  installHomeserverWriteRetryDependenciesForTests,
} from '@/services/homeserver/write-retry';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
import {
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  type SettingsState,
} from '@/stores/settings/settings.types';
import { asOpaque } from '@/test-utils/type-assertions';

// A homeserver in memory behind the SDK boundary; HomeserverService, the applications,
// the normalizers, the stores and IndexedDB are real.
const homeserver = vi.hoisted(() => ({
  files: new Map<string, string>(),
  putJson: vi.fn<(path: string, body: unknown) => Promise<void>>(),
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@synonymdev/pubky', () => {
  const read = (path: string) =>
    homeserver.files.has(path)
      ? new Response(homeserver.files.get(path), { status: 200 })
      : new Response('Not found', { status: 404 });
  const createSdk = () => ({
    client: { fetch: async (url: string) => read(url.replace(/^pubky:\/\/[^/]+/, '')) },
    publicStorage: { get: vi.fn(), exists: vi.fn(), list: vi.fn() },
  });
  const MockPubky = vi.fn().mockImplementation(createSdk);
  // @ts-expect-error testnet is a static constructor on the SDK class
  MockPubky.testnet = vi.fn().mockImplementation(createSdk);
  // @ts-expect-error withClient is a static constructor on the SDK class
  MockPubky.withClient = vi.fn().mockImplementation(createSdk);
  return { Pubky: MockPubky, Client: vi.fn(), resolvePubky: (url: string) => url };
});

const USER = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
const PROFILE_PATH = '/pub/pubky.app/profile.json';
const LAST_READ_PATH = '/pub/pubky.app/last_read';

function session(): Session {
  return asOpaque<Session>({
    info: { publicKey: { z32: () => USER } },
    storage: {
      putJson: (path: string, body: unknown) => homeserver.putJson(path, body),
      get: async (path: string) =>
        homeserver.files.has(path)
          ? new Response(homeserver.files.get(path), { status: 200 })
          : new Response('Not found', { status: 404 }),
      exists: async (path: string) => homeserver.files.has(path),
      putBytes: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    },
  });
}

function sdkError(statusCode: number): Error {
  const body = statusCode === 409 ? `Conflict - ${HOMESERVER_PUBLISH_CONFLICT_MESSAGE}` : 'Error';
  return Object.assign(new Error(`Request failed: Server responded with an error: ${statusCode} ${body}`), {
    name: 'RequestError',
    data: { statusCode },
  });
}

/** Runs during each retry backoff, between a rejected attempt and the next one. */
let onBackoff: (() => void | Promise<void>) | undefined;

beforeEach(async () => {
  homeserver.files.clear();
  homeserver.putJson.mockReset().mockImplementation(async (path, body) => {
    homeserver.files.set(path, JSON.stringify(body));
  });
  onBackoff = undefined;
  installHomeserverWriteRetryDependenciesForTests({
    sleep: async () => {
      await onBackoff?.();
    },
    random: () => 0,
  });
  useAuthStore.setState({
    session: session(),
    currentUserPubky: USER,
    generation: 'generation-1',
    restoreStatus: 'ready',
    sessionReference: null,
    isLoggingOut: false,
  });
  await UserDetailsModel.table.clear();
  await UserTtlModel.table.clear();
});

afterEach(() => {
  installHomeserverWriteRetryDependenciesForTests(null);
  useAuthStore.setState({ session: null, currentUserPubky: null, generation: '', isLoggingOut: false });
  vi.restoreAllMocks();
});

const putsTo = (path: string) =>
  homeserver.putJson.mock.calls.filter(([putPath]) => putPath === path).map(([, body]) => body);

describe('a profile edit that the homeserver refuses re-reads before retrying', () => {
  const published = {
    name: 'Alice',
    bio: 'old bio',
    image: `pubky://${USER}/pub/pubky.app/files/0035S78QPP4S0`,
    links: [{ title: 'WEBSITE', url: 'https://example.com/' }],
    status: 'working',
  };

  it.each([429, 500, 503, 409])('keeps a bio another device saved during the backoff after a %i', async (status) => {
    homeserver.files.set(PROFILE_PATH, JSON.stringify(published));
    homeserver.putJson.mockRejectedValueOnce(sdkError(status));
    onBackoff = () => {
      homeserver.files.set(PROFILE_PATH, JSON.stringify({ ...published, bio: 'new bio from device B' }));
    };

    await ProfileApplication.commitUpdateStatus({ pubky: USER, status: 'back' });

    expect(putsTo(PROFILE_PATH)).toEqual([
      expect.objectContaining({ bio: 'old bio', status: 'back' }),
      expect.objectContaining({ bio: 'new bio from device B', status: 'back' }),
    ]);
    expect(JSON.parse(homeserver.files.get(PROFILE_PATH)!)).toMatchObject({
      bio: 'new bio from device B',
      status: 'back',
    });
    expect(await UserDetailsModel.findById(USER)).toMatchObject({ bio: 'new bio from device B', status: 'back' });
  });

  it('does not write again once logout begins during the backoff', async () => {
    homeserver.files.set(PROFILE_PATH, JSON.stringify(published));
    homeserver.putJson.mockRejectedValueOnce(sdkError(503));
    onBackoff = () => {
      useAuthStore.setState({ isLoggingOut: true });
    };

    await expect(ProfileApplication.commitUpdateStatus({ pubky: USER, status: 'back' })).rejects.toMatchObject({
      code: AuthErrorCode.SESSION_EXPIRED,
    });
    expect(homeserver.putJson).toHaveBeenCalledOnce();
  });
});

describe('a settings write that the homeserver refuses with the publish conflict', () => {
  const settings: SettingsState = {
    notifications: defaultNotificationPreferences,
    privacy: { ...defaultPrivacyPreferences, moderationBot: 'euwmq57zefw5ynnkhh37b3gcmhs7g3cptdbw1doaxj1pbmzp3wro' },
    muted: [],
    updatedAt: 1_700_000_000_000,
    version: 1,
  };

  it('rejects instead of writing again when logout begins and the caller aborts during the backoff', async () => {
    const controller = new AbortController();
    homeserver.putJson.mockRejectedValueOnce(sdkError(409));
    onBackoff = () => {
      controller.abort();
      useAuthStore.setState({ isLoggingOut: true });
    };

    await expect(SettingsApplication.commitUpdate(settings, USER, controller.signal)).rejects.toMatchObject({
      code: AuthErrorCode.SESSION_EXPIRED,
    });
    expect(homeserver.putJson).toHaveBeenCalledOnce();
  });

  it('rejects instead of adopting a replacement session for the same account', async () => {
    homeserver.putJson.mockRejectedValueOnce(sdkError(409));
    onBackoff = () => {
      useAuthStore.setState({ session: session() });
    };

    await expect(SettingsApplication.commitUpdate(settings, USER)).rejects.toMatchObject({
      code: AuthErrorCode.SESSION_EXPIRED,
    });
    expect(homeserver.putJson).toHaveBeenCalledOnce();
  });
});

describe('marking notifications read never moves last_read backward', () => {
  const T1 = 1_000;
  const T2 = 2_000;
  const lastRead = (timestamp: number) =>
    asOpaque<LastReadResult>({
      last_read: { timestamp: BigInt(timestamp), toJson: () => ({ timestamp }) },
      meta: { url: `pubky://${USER}${LAST_READ_PATH}` },
      free: vi.fn(),
    });

  beforeEach(() => {
    useNotificationStore.getState().setLastRead(0);
    useNotificationStore.getState().setUnread(3);
  });

  it('holds a retried mark, lets a later one finish, and keeps both markers at the later time', async () => {
    vi.spyOn(LastReadNormalizer, 'to').mockReturnValueOnce(lastRead(T1)).mockReturnValueOnce(lastRead(T2));
    let releaseA!: () => void;
    homeserver.putJson.mockRejectedValueOnce(sdkError(429));
    onBackoff = () =>
      new Promise<void>((resolve) => {
        releaseA = resolve;
      });

    const a = NotificationController.markAllAsRead();
    await vi.waitFor(() => expect(releaseA).toBeTypeOf('function'));
    const b = NotificationController.markAllAsRead();
    releaseA();
    await Promise.all([a, b]);

    expect(putsTo(LAST_READ_PATH)).toEqual([{ timestamp: T1 }, { timestamp: T1 }, { timestamp: T2 }]);
    expect(JSON.parse(homeserver.files.get(LAST_READ_PATH)!)).toEqual({ timestamp: T2 });
    expect(useNotificationStore.getState().lastRead).toBe(T2);
  });

  it('keeps a newer acknowledgment another tab saved while the retry waited, remotely and locally', async () => {
    vi.spyOn(LastReadNormalizer, 'to').mockReturnValueOnce(lastRead(T1));
    homeserver.putJson.mockRejectedValueOnce(sdkError(503));
    onBackoff = () => {
      homeserver.files.set(LAST_READ_PATH, JSON.stringify({ timestamp: T2 }));
    };

    await NotificationController.markAllAsRead();

    expect(putsTo(LAST_READ_PATH)).toEqual([{ timestamp: T1 }]);
    expect(JSON.parse(homeserver.files.get(LAST_READ_PATH)!)).toEqual({ timestamp: T2 });
    expect(useNotificationStore.getState().lastRead).toBe(T2);
  });
});
