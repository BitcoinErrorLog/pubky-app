import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiApplication } from '@/application/pubchi/pubchi';
import * as deviceKey from '@/libs/pubchi/device-key';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthStore } from '@/stores/auth/auth.types';
import { PubchiController } from './pubchi';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky;
const BOT = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

function setPubchiEnv(enabled?: string, apiUrl?: string) {
  if (enabled === undefined) delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
  else process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = enabled;
  if (apiUrl === undefined) delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl];
  else process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = apiUrl;
  resetRuntimeConfigForTests();
}

describe('PubchiController', () => {
  beforeEach(() => {
    vi.spyOn(useAuthStore, 'getState').mockReturnValue({
      selectCurrentUserPubky: () => OWNER,
      currentUserPubky: OWNER,
    } as AuthStore);
  });

  afterEach(() => {
    setPubchiEnv();
    vi.restoreAllMocks();
  });

  it('does not call the application or network when the flag is off', async () => {
    setPubchiEnv('false');
    const querySpy = vi.spyOn(PubchiApplication, 'query');
    const createSpy = vi.spyOn(PubchiApplication, 'commitCreateBinding');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(PubchiController.getActiveBinding()).resolves.toBeUndefined();
    await expect(PubchiController.commitCreateBinding({ bot: BOT })).rejects.toThrow('PUBCHI_DISABLED');
    await expect(PubchiController.commitDeleteBinding()).rejects.toThrow('PUBCHI_DISABLED');
    await expect(
      PubchiController.fetchPubchiQuery({
        question: 'who tagged me?',
        purpose: 'who-tagged-me',
      }),
    ).rejects.toThrow('PUBCHI_DISABLED');

    expect(querySpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchPubchiQuery delegates to the application when the panel is enabled', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const success = {
      kind: 'query' as const,
      result: { schema: 'pubchi-query-result' },
    };
    const querySpy = vi.spyOn(PubchiApplication, 'query').mockResolvedValue(success as never);
    await expect(
      PubchiController.fetchPubchiQuery({ question: 'who tagged me?', purpose: 'who-tagged-me' }),
    ).resolves.toEqual(success);
    expect(querySpy).toHaveBeenCalledWith({
      owner: OWNER,
      question: 'who tagged me?',
      purpose: 'who-tagged-me',
    });
  });

  it('commitCreateBinding rejects an invalid bot pubky before writing', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const createSpy = vi.spyOn(PubchiApplication, 'commitCreateBinding');
    await expect(PubchiController.commitCreateBinding({ bot: 'not-a-pubky' })).rejects.toThrow('INVALID_PUBKY');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('does not DELETE a UI-supplied path-injection signer', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);
    await expect(PubchiController.revokeDevice('../bots/x')).rejects.toThrow('INVALID_PUBKY');
    await expect(PubchiController.revokeDevice('../../pubky.app/profile')).rejects.toThrow('INVALID_PUBKY');
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it('deletes a Dexie-planted invalid signer that cannot be revoked remotely', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const planted = '../../pubky.app/profile';
    vi.spyOn(deviceKey, 'getDeviceKeys').mockResolvedValue([
      {
        id: `${OWNER}:${planted}`,
        owner: OWNER,
        signer: planted,
        key: {} as CryptoKey,
        created_at: 1,
        expires_at: 2_000_000_000,
      },
    ]);
    const deleteSpy = vi.spyOn(deviceKey, 'deleteDeviceKey').mockResolvedValue(undefined);
    const requestSpy = vi.spyOn(HomeserverService, 'request').mockResolvedValue(undefined);

    await PubchiController.revokeAllDevices();

    expect(requestSpy).not.toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledWith(OWNER, planted);
  });
});
