import { createHmac, hkdfSync } from 'node:crypto';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { describe, expect, it } from 'vitest';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  decryptPrivRecord,
  encryptPrivRecord,
  PRIV_ENVELOPE_ENC,
  PRIV_V2_BASE_PATH,
  privAad,
  privEntryPath,
  privEntryUrl,
  privEnvelopeRejection,
  privFamilyPath,
  type PrivKeyring,
} from './priv-envelope';

const OWNER = 'o'.repeat(52);
const OTHER_OWNER = 'p'.repeat(52);
const KID_A = 'a'.repeat(32);
const KID_B = 'b'.repeat(32);
const KEY_A = new Uint8Array(32).fill(7);
const KEY_B = new Uint8Array(32).fill(9);

function keyring(overrides: Partial<PrivKeyring> = {}): PrivKeyring {
  return {
    ownerPubky: OWNER,
    currentKeyId: KID_A,
    keys: [{ keyId: KID_A, key: KEY_A }],
    ...overrides,
  };
}

function rejection(run: () => unknown): string | null {
  try {
    run();
  } catch (error) {
    return privEnvelopeRejection(error);
  }
  return 'accepted';
}

// The offline recipe, written against node:crypto rather than the module
// under test: HKDF-SHA256 subkeys, HMAC-SHA256 path segments, base64url.
function recipeSubkey(dataKey: Uint8Array, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', dataKey, Buffer.from(PRIV_ENVELOPE_ENC), Buffer.from(info), 32));
}
function recipeSegment(pathKey: Buffer, input: string): string {
  return createHmac('sha256', pathKey).update(input).digest('base64url');
}

describe('priv envelope', () => {
  it('round-trips a record and stores no plaintext', () => {
    const record = { listingId: 'boots_01', note: 'secret watch' };
    const envelope = encryptPrivRecord({ keyring: keyring(), family: 'watchlist', id: 'watchlist', record });
    expect(envelope.enc).toBe(PRIV_ENVELOPE_ENC);
    expect(envelope.kid).toBe(KID_A);
    expect(base64UrlToBytes(envelope.nonce)).toHaveLength(24);
    expect(JSON.stringify(envelope)).not.toContain('boots_01');
    expect(JSON.stringify(envelope)).not.toContain('secret');
    expect(decryptPrivRecord({ keyring: keyring(), family: 'watchlist', id: 'watchlist', envelope })).toEqual(record);
  });

  it('uses a fresh nonce for every seal', () => {
    const input = { keyring: keyring(), family: 'watchlist' as const, id: 'watchlist', record: { a: 1 } };
    expect(encryptPrivRecord(input).nonce).not.toBe(encryptPrivRecord(input).nonce);
  });

  it('binds the ciphertext to owner, family, entry and key id', () => {
    const envelope = encryptPrivRecord({ keyring: keyring(), family: 'order_receipt', id: 'r1', record: { a: 1 } });
    expect(
      rejection(() => decryptPrivRecord({ keyring: keyring(), family: 'order_receipt', id: 'r2', envelope })),
    ).toBe('unauthenticated');
    expect(rejection(() => decryptPrivRecord({ keyring: keyring(), family: 'watchlist', id: 'r1', envelope }))).toBe(
      'unauthenticated',
    );
    expect(
      rejection(() =>
        decryptPrivRecord({
          keyring: keyring({ ownerPubky: OTHER_OWNER }),
          family: 'order_receipt',
          id: 'r1',
          envelope,
        }),
      ),
    ).toBe('unauthenticated');
    // The same key bytes under another key id do not open it either.
    const relabelled = keyring({ currentKeyId: KID_B, keys: [{ keyId: KID_B, key: KEY_A }] });
    expect(
      rejection(() =>
        decryptPrivRecord({
          keyring: relabelled,
          family: 'order_receipt',
          id: 'r1',
          envelope: { ...envelope, kid: KID_B },
        }),
      ),
    ).toBe('unauthenticated');
  });

  it('rejects tampered ciphertext, unknown key ids and non-envelopes', () => {
    const envelope = encryptPrivRecord({ keyring: keyring(), family: 'watchlist', id: 'watchlist', record: { a: 1 } });
    const ct = base64UrlToBytes(envelope.ct);
    ct[0] ^= 1;
    const read = (value: unknown) => () =>
      decryptPrivRecord({ keyring: keyring(), family: 'watchlist', id: 'watchlist', envelope: value });
    expect(rejection(read({ ...envelope, ct: bytesToBase64Url(ct) }))).toBe('unauthenticated');
    expect(rejection(read({ ...envelope, kid: KID_B }))).toBe('unknown_key');
    expect(rejection(read({ schemaVersion: 1, recordType: 'watchlist' }))).toBe('malformed');
    expect(rejection(read({ ...envelope, extra: true }))).toBe('malformed');
    expect(rejection(read({ ...envelope, nonce: bytesToBase64Url(new Uint8Array(12)) }))).toBe('malformed');
  });

  it('seals under the current key and opens records sealed under an older key', () => {
    const old = encryptPrivRecord({ keyring: keyring(), family: 'watchlist', id: 'watchlist', record: { v: 1 } });
    const rotated = keyring({
      currentKeyId: KID_B,
      keys: [
        { keyId: KID_A, key: KEY_A },
        { keyId: KID_B, key: KEY_B },
      ],
    });
    expect(decryptPrivRecord({ keyring: rotated, family: 'watchlist', id: 'watchlist', envelope: old })).toEqual({
      v: 1,
    });
    expect(encryptPrivRecord({ keyring: rotated, family: 'watchlist', id: 'watchlist', record: { v: 2 } }).kid).toBe(
      KID_B,
    );
    // Paths come from the first key, so they do not move when the current key does.
    expect(privEntryPath(rotated, 'watchlist', 'watchlist')).toBe(privEntryPath(keyring(), 'watchlist', 'watchlist'));
  });

  it('hides family and entry names behind stable keyed path segments', () => {
    const path = privEntryPath(keyring(), 'order_receipt', '018f47d2-6a27-7c23-a49d-6b21bb770120');
    expect(path.startsWith(PRIV_V2_BASE_PATH)).toBe(true);
    expect(path).not.toContain('receipt');
    expect(path).not.toContain('018f47d2');
    expect(path).toBe(privEntryPath(keyring(), 'order_receipt', '018f47d2-6a27-7c23-a49d-6b21bb770120'));
    expect(privFamilyPath(keyring(), 'watchlist')).not.toBe(privFamilyPath(keyring(), 'order_receipt'));
    expect(privEntryPath(keyring({ keys: [{ keyId: KID_A, key: KEY_B }] }), 'watchlist', 'watchlist')).not.toBe(
      privEntryPath(keyring(), 'watchlist', 'watchlist'),
    );
    expect(privEntryUrl(keyring(), 'watchlist', 'watchlist')).toBe(
      `pubky://${OWNER}${privEntryPath(keyring(), 'watchlist', 'watchlist')}`,
    );
  });

  it('matches the documented recipe computed independently with node:crypto', () => {
    const pathKey = recipeSubkey(KEY_A, 'path');
    const family = recipeSegment(pathKey, 'family|order_receipt');
    const entry = recipeSegment(pathKey, 'id|order_receipt|r1');
    expect(privEntryPath(keyring(), 'order_receipt', 'r1')).toBe(`${PRIV_V2_BASE_PATH}${family}/${entry}`);

    const envelope = encryptPrivRecord({ keyring: keyring(), family: 'order_receipt', id: 'r1', record: { a: 1 } });
    const recordKey = recipeSubkey(KEY_A, 'record');
    const bytes = (value: Buffer) => Uint8Array.from(value);
    const plaintext = xchacha20poly1305(
      bytes(recordKey),
      bytes(Buffer.from(envelope.nonce, 'base64url')),
      bytes(Buffer.from(`${OWNER}|order_receipt|r1|${KID_A}`)),
    ).decrypt(bytes(Buffer.from(envelope.ct, 'base64url')));
    expect(JSON.parse(Buffer.from(plaintext).toString('utf8'))).toEqual({ a: 1 });
  });

  it('refuses a field that could forge the associated-data layout', () => {
    expect(rejection(() => privAad(OWNER, 'watchlist', 'a|b', KID_A))).toBe('malformed');
    expect(rejection(() => privAad(OWNER, 'watchlist', '', KID_A))).toBe('malformed');
  });
});
