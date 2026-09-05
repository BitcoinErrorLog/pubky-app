import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAppError } from '@/libs/error/error';
import {
  deleteWrappingKeyStore,
  dropCachedWrappingKeyForTests,
  getOrCreateWrappingKey,
  resetMessagingKeyringForTests,
} from './messaging-keyring';

describe('messaging keyring (wrapping-key custody)', () => {
  beforeEach(async () => {
    await resetMessagingKeyringForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generates a non-extractable AES-GCM-256 key with encrypt/decrypt usages', async () => {
    const key = await getOrCreateWrappingKey();
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect(key.extractable).toBe(false);
    expect(key.usages).toEqual(expect.arrayContaining(['encrypt', 'decrypt']));
  });

  it('caches the key in memory for the session', async () => {
    const first = await getOrCreateWrappingKey();
    const second = await getOrCreateWrappingKey();
    expect(second).toBe(first);
  });

  it('persists the key so a cache drop (reload) reloads an equivalent key', async () => {
    const first = await getOrCreateWrappingKey();
    dropCachedWrappingKeyForTests();
    const reloaded = await getOrCreateWrappingKey();
    // Same persisted key material: data wrapped by the first key must unwrap
    // under the reloaded one.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, first, new Uint8Array([9, 8, 7]));
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, reloaded, ciphertext);
    expect([...new Uint8Array(plaintext)]).toEqual([9, 8, 7]);
  });

  it('deletes the persisted key (sign-out wipe): the next load generates a fresh one', async () => {
    const first = await getOrCreateWrappingKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, first, new Uint8Array([1]));
    await deleteWrappingKeyStore();
    const fresh = await getOrCreateWrappingKey();
    expect(fresh).not.toBe(first);
    await expect(crypto.subtle.decrypt({ name: 'AES-GCM', iv }, fresh, ciphertext)).rejects.toThrow();
  });

  it('fails closed (AppError, never plaintext) when crypto.subtle is unavailable', async () => {
    const { subtle: _subtle, ...rest } = globalThis.crypto;
    vi.stubGlobal('crypto', rest);
    await expect(getOrCreateWrappingKey()).rejects.toSatisfy(
      (error) => isAppError(error) && /never falls back to plaintext/.test(error.message),
    );
  });

  it('fails closed when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(getOrCreateWrappingKey()).rejects.toSatisfy(
      (error) => isAppError(error) && /nowhere to persist/.test(error.message),
    );
  });
});
