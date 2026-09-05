import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiApplication } from '@/application/pubchi/pubchi';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import type { Pubky } from '@/models/models.types';
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
      PubchiController.fetchPubchiQuery({ question: 'who tagged me?', secretSeed: new Uint8Array(32) }),
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
    const seed = new Uint8Array(32);

    await expect(PubchiController.fetchPubchiQuery({ question: 'who tagged me?', secretSeed: seed })).resolves.toEqual(
      success,
    );
    expect(querySpy).toHaveBeenCalledWith({ owner: OWNER, question: 'who tagged me?', secretSeed: seed });
  });

  it('commitCreateBinding rejects an invalid bot pubky before writing', async () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    const createSpy = vi.spyOn(PubchiApplication, 'commitCreateBinding');
    await expect(PubchiController.commitCreateBinding({ bot: 'not-a-pubky' })).rejects.toThrow('INVALID_PUBKY');
    expect(createSpy).not.toHaveBeenCalled();
  });
});
