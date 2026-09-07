import { afterEach, describe, expect, it } from 'vitest';
import { deletePubchiDatabase, getPubchiDatabase, resetPubchiDatabaseForTests } from '@/database/pubchi/pubchi';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { getCurrentDeviceKey, loadOrGenerateDeviceKey, signWithDeviceKey, wipeDeviceKeysNotOwnedBy } from './device-key';

const OWNER = 'ybndrfg8ejkmcpqxot1uwisza345h769ybndrfg8ejkmcpqxot1u';

describe('Pubchi device signer persistence', () => {
  afterEach(async () => {
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    resetRuntimeConfigForTests();
    await deletePubchiDatabase();
    resetPubchiDatabaseForTests();
  });

  it('reloads the stored CryptoKey and signs after a fresh module load', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const created = await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);
    resetPubchiDatabaseForTests();
    const restored = await getCurrentDeviceKey(OWNER, 1_800_000_001);
    expect(restored?.signer).toBe(created.signer);
    await expect(signWithDeviceKey(restored!.key, new TextEncoder().encode('reload-proof'))).resolves.toMatch(/^[0-9a-f]{128}$/);
  });

  it('creates a non-extractable private key that Web Crypto refuses to export', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const created = await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);
    expect(created.key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('pkcs8', created.key)).rejects.toThrow();
  });

  it('fails closed when no device key is available', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    expect(await getCurrentDeviceKey(OWNER, 1_800_000_000)).toBeUndefined();
  });

  it('rejects a fourth live device signer', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const key = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
    await getPubchiDatabase().deviceKeys.bulkPut(
      [1, 2, 3].map((n) => ({
        id: `${OWNER}:device-${n}`,
        owner: OWNER,
        signer: `device-${n}`,
        key: (key as CryptoKeyPair).privateKey,
        created_at: 1,
        expires_at: 1_900_000_000,
      })),
    );
    await expect(loadOrGenerateDeviceKey(OWNER, 1_800_000_000)).rejects.toThrow('PUBCHI_DEVICE_LIMIT');
  });

  it('wipes local keys that belong to another identity', async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    resetRuntimeConfigForTests();
    const created = await loadOrGenerateDeviceKey(OWNER, 1_800_000_000);
    const other = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    await getPubchiDatabase().deviceKeys.put({
      id: `${other}:foreign`,
      owner: other,
      signer: 'foreign',
      key: created.key,
      created_at: 1,
      expires_at: 1_900_000_000,
    });
    expect(await wipeDeviceKeysNotOwnedBy(OWNER)).toBe(1);
    expect(await getCurrentDeviceKey(OWNER, 1_800_000_001)).toMatchObject({ signer: created.signer });
    const leftover = await getPubchiDatabase().deviceKeys.where('owner').equals(other).toArray();
    expect(leftover).toEqual([]);
  });
});
