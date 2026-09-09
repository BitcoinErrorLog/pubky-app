import { describe, expect, it } from 'vitest';
import vectors from './__fixtures__/request-v2-vectors.json';
import { bytesToHex, canonicalJson } from './canonical';
import { signRequestObjectV2, unsignedBytesV2, type UnsignedRequestObjectV2 } from './request';

const seed = new Uint8Array(32).fill(7);

async function vectorKey(): Promise<CryptoKey> {
  const prefix = Uint8Array.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  const pkcs8 = new Uint8Array(prefix.length + seed.length);
  pkcs8.set(prefix);
  pkcs8.set(seed, prefix.length);
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
}

describe('RequestObjectV2 vectors', () => {
  it('reproduces every canonical byte sequence and signature', async () => {
    const key = await vectorKey();
    for (const vector of vectors.vectors) {
      const unsigned = JSON.parse(new TextDecoder().decode(Uint8Array.from(Buffer.from(vector.canonical_unsigned_hex, 'hex')))) as UnsignedRequestObjectV2;
      expect(canonicalJson(unsigned)).toBe(new TextDecoder().decode(Uint8Array.from(Buffer.from(vector.canonical_unsigned_hex, 'hex'))));
      expect(bytesToHex(unsignedBytesV2(unsigned))).toBe(vector.canonical_unsigned_hex);
      expect((await signRequestObjectV2(unsigned, key)).signature).toBe(vector.signature_hex);
    }
  });
});
