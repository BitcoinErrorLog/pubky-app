import { afterEach, describe, expect, it } from 'vitest';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { getPubchiQueryUrl, isPubchiEnabled, isPubchiPanelEnabled } from './flags';

function setPubchiEnv(enabled?: string, apiUrl?: string) {
  if (enabled === undefined) delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
  else process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = enabled;
  if (apiUrl === undefined) delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl];
  else process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = apiUrl;
  resetRuntimeConfigForTests();
}

describe('pubchi flags', () => {
  afterEach(() => {
    setPubchiEnv();
  });

  it('defaults to disabled with the panel hidden', () => {
    setPubchiEnv();
    expect(isPubchiEnabled()).toBe(false);
    expect(isPubchiPanelEnabled()).toBe(false);
  });

  it('hides the panel when the flag is on but the API URL is empty', () => {
    setPubchiEnv('true', '');
    expect(isPubchiEnabled()).toBe(true);
    expect(isPubchiPanelEnabled()).toBe(false);
  });

  it('shows the panel only when the flag and API URL are set', () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    expect(isPubchiEnabled()).toBe(true);
    expect(isPubchiPanelEnabled()).toBe(true);
    expect(getPubchiQueryUrl()).toBe('https://pubchi.example.com/v1/query');
  });
});
