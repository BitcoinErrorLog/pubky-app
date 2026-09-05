import { afterEach, describe, expect, it, vi } from 'vitest';
import * as canonical from './canonical';
import { signEd25519 } from './ed25519';

const PKCS8_PREFIX_LENGTH = 16;
const SEED_LENGTH = 32;
const PKCS8_LENGTH = PKCS8_PREFIX_LENGTH + SEED_LENGTH;

function seedFilled(value: number): Uint8Array {
  return new Uint8Array(SEED_LENGTH).fill(value);
}

/**
 * Capture the PKCS8 argument, the `asCryptoBytes` copy, and count the 32-byte
 * seed-copy `fill(0)` so the test can assert all three are zero after `finally`.
 */
function captureSecretBuffers() {
  let pkcs8: Uint8Array | undefined;
  let keyBytes: Uint8Array | undefined;
  let seedCopyZeroed = 0;
  const realAsCryptoBytes = canonical.asCryptoBytes;
  vi.spyOn(canonical, 'asCryptoBytes').mockImplementation((bytes) => {
    const copy = realAsCryptoBytes(bytes);
    if (bytes.length === PKCS8_LENGTH && pkcs8 === undefined) {
      pkcs8 = bytes;
      keyBytes = copy;
    }
    return copy;
  });

  const originalFill = Uint8Array.prototype.fill;
  vi.spyOn(Uint8Array.prototype, 'fill').mockImplementation(function (
    this: Uint8Array,
    ...args: Parameters<Uint8Array['fill']>
  ) {
    const result = originalFill.apply(this, args);
    if (args[0] === 0 && this.length === SEED_LENGTH) {
      expect([...this].every((byte) => byte === 0)).toBe(true);
      seedCopyZeroed += 1;
    }
    return result;
  });

  return {
    buffers: () => ({ pkcs8, keyBytes, seedCopyZeroed }),
  };
}

function expectZeroed(buffers: { pkcs8?: Uint8Array; keyBytes?: Uint8Array; seedCopyZeroed: number }) {
  expect(buffers.pkcs8, 'pkcs8 captured').toBeDefined();
  expect(buffers.keyBytes, 'keyBytes captured').toBeDefined();
  expect(buffers.seedCopyZeroed).toBe(1);
  expect([...buffers.pkcs8!].every((byte) => byte === 0)).toBe(true);
  expect([...buffers.keyBytes!].every((byte) => byte === 0)).toBe(true);
}

describe('signEd25519 zeroize', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('zeroizes pkcs8, seedCopy, and the asCryptoBytes copy after a successful sign', async () => {
    const capture = captureSecretBuffers();
    const signature = await signEd25519(seedFilled(7), new TextEncoder().encode('pubchi'));
    expect(signature.length).toBe(64);
    expectZeroed(capture.buffers());
  });

  it('zeroizes pkcs8, seedCopy, and the asCryptoBytes copy when importKey throws', async () => {
    const capture = captureSecretBuffers();
    vi.spyOn(crypto.subtle, 'importKey').mockRejectedValue(new Error('import failed'));
    await expect(signEd25519(seedFilled(9), new TextEncoder().encode('pubchi'))).rejects.toThrow('import failed');
    expectZeroed(capture.buffers());
  });
});
