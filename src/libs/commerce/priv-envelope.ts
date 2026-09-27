import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { z } from 'zod';
import { isAppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

// -----------------------------------------------------------------------------
// Encrypted `/priv` records (priv-encryption-plan.md, Phase 2).
//
// Each owner has one or more 32-byte data keys released by the marketplace
// service (`GET /v1/me/priv-keys`). From each data key, HKDF-SHA256 derives
// two subkeys:
//
//   record key = HKDF(ikm = data key, salt = "pubky-priv-aead/v1", info = "record", 32)
//   path key   = HKDF(ikm = data key, salt = "pubky-priv-aead/v1", info = "path", 32)
//
// A record is the UTF-8 JSON of the plaintext document, sealed with
// XChaCha20-Poly1305 under the record key with a fresh 24-byte nonce and
// associated data `{owner}|{family}|{id}|{kid}`, so a ciphertext moved to
// another owner, family, entry or key id does not open. The stored document
// is the envelope `{ enc, kid, nonce, ct }` with base64url (no padding)
// nonce and ciphertext.
//
// The path hides the family and entry names from the homeserver:
//
//   /priv/pubky.app/marketplace/v2/s/{b64url(HMAC(path key, "family|" + family))}/
//                                    {b64url(HMAC(path key, "id|" + family + "|" + id))}
//
// Paths always use the owner's FIRST (oldest) key so they stay put when a new
// key becomes current. Pure functions: nothing here stores, logs or caches a
// key or plaintext.
// -----------------------------------------------------------------------------

export const PRIV_ENVELOPE_ENC = 'pubky-priv-aead/v1';
export const PRIV_V2_BASE_PATH = '/priv/pubky.app/marketplace/v2/s/';
/** Logged instead of an opaque v2 path. */
export const PRIV_V2_LOG_PATH = `${PRIV_V2_BASE_PATH}<entry>`;

export const PRIV_DATA_KEY_BYTES = 32;
const NONCE_BYTES = 24;
const KEY_ID = /^[0-9a-f]{32}$/;
const HKDF_SALT = new TextEncoder().encode(PRIV_ENVELOPE_ENC);

/** The logical record families stored under the v2 prefix. */
export type PrivFamily = 'watchlist' | 'order_receipt' | 'attention_seen/activity' | 'attention_seen/orders';

export type PrivDataKey = {
  keyId: string;
  key: Uint8Array;
};

/**
 * An owner's released data keys. `keys` is oldest first; `currentKeyId`
 * names the key new records are sealed under.
 */
export type PrivKeyring = {
  ownerPubky: string;
  currentKeyId: string;
  keys: PrivDataKey[];
};

export const privEnvelopeSchema = z
  .object({
    enc: z.literal(PRIV_ENVELOPE_ENC),
    kid: z.string().regex(KEY_ID),
    nonce: z.string().min(1),
    ct: z.string().min(1),
  })
  .strict();

export type PrivEnvelope = z.infer<typeof privEnvelopeSchema>;

export type PrivEnvelopeRejection = 'malformed' | 'unknown_key' | 'unauthenticated';

function rejected(reason: PrivEnvelopeRejection) {
  return Err.validation(ValidationErrorCode.INVALID_INPUT, 'Encrypted private record rejected.', {
    service: ErrorService.Local,
    operation: 'privEnvelope',
    context: { reason },
  });
}

/** The rejection reason of an error thrown by this module, or null for any other error. */
export function privEnvelopeRejection(error: unknown): PrivEnvelopeRejection | null {
  if (!isAppError(error) || error.operation !== 'privEnvelope') return null;
  const reason = error.context?.reason;
  return reason === 'malformed' || reason === 'unknown_key' || reason === 'unauthenticated' ? reason : null;
}

export function isPrivKeyId(value: string): boolean {
  return KEY_ID.test(value);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    throw rejected('malformed');
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function subkey(dataKey: Uint8Array, info: 'record' | 'path'): Uint8Array {
  return hkdf(sha256, dataKey, HKDF_SALT, new TextEncoder().encode(info), PRIV_DATA_KEY_BYTES);
}

function assertField(value: string): void {
  if (value.length === 0 || value.includes('|')) throw rejected('malformed');
}

export function privAad(ownerPubky: string, family: PrivFamily, id: string, keyId: string): Uint8Array {
  for (const field of [ownerPubky, family, id, keyId]) assertField(field);
  return new TextEncoder().encode(`${ownerPubky}|${family}|${id}|${keyId}`);
}

function pathKey(keyring: PrivKeyring): Uint8Array {
  const first = keyring.keys[0];
  if (!first) throw rejected('unknown_key');
  return subkey(first.key, 'path');
}

function segment(key: Uint8Array, input: string): string {
  return bytesToBase64Url(hmac(sha256, key, new TextEncoder().encode(input)));
}

/** `/priv/pubky.app/marketplace/v2/s/{family}/` for one family. */
export function privFamilyPath(keyring: PrivKeyring, family: PrivFamily): string {
  return `${PRIV_V2_BASE_PATH}${segment(pathKey(keyring), `family|${family}`)}/`;
}

/** The opaque path of one entry. */
export function privEntryPath(keyring: PrivKeyring, family: PrivFamily, id: string): string {
  assertField(id);
  return `${privFamilyPath(keyring, family)}${segment(pathKey(keyring), `id|${family}|${id}`)}`;
}

/**
 * A listed entry: its name is a random 32-hex id (see {@link newPrivEntryName})
 * rather than an HMAC, because readers find it by listing the family, and
 * the name doubles as the entry id in the associated data.
 */
export function privListedEntryPath(keyring: PrivKeyring, family: PrivFamily, name: string): string {
  if (!isPrivEntryName(name)) throw rejected('malformed');
  return `${privFamilyPath(keyring, family)}${name}`;
}

export function privListedEntryUrl(keyring: PrivKeyring, family: PrivFamily, name: string): string {
  return `pubky://${keyring.ownerPubky}${privListedEntryPath(keyring, family, name)}`;
}

const ENTRY_NAME = /^[0-9a-f]{32}$/;

export function isPrivEntryName(value: string): boolean {
  return ENTRY_NAME.test(value);
}

export function newPrivEntryName(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function privEntryUrl(keyring: PrivKeyring, family: PrivFamily, id: string): string {
  return `pubky://${keyring.ownerPubky}${privEntryPath(keyring, family, id)}`;
}

export function privFamilyUrl(keyring: PrivKeyring, family: PrivFamily): string {
  return `pubky://${keyring.ownerPubky}${privFamilyPath(keyring, family)}`;
}

/** Seals `record` under the keyring's current key. */
export function encryptPrivRecord(input: {
  keyring: PrivKeyring;
  family: PrivFamily;
  id: string;
  record: unknown;
}): PrivEnvelope {
  const { keyring, family, id, record } = input;
  const current = keyring.keys.find((key) => key.keyId === keyring.currentKeyId);
  if (!current) throw rejected('unknown_key');
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(record));
  const ct = xchacha20poly1305(
    subkey(current.key, 'record'),
    nonce,
    privAad(keyring.ownerPubky, family, id, current.keyId),
  ).encrypt(plaintext);
  plaintext.fill(0);
  return { enc: PRIV_ENVELOPE_ENC, kid: current.keyId, nonce: bytesToBase64Url(nonce), ct: bytesToBase64Url(ct) };
}

/**
 * Opens an envelope read from `family`/`id`. Throws a rejection (see
 * {@link privEnvelopeRejection}) when it is not an envelope, names a key the keyring does not hold, or does
 * not authenticate for this owner, family, entry and key id.
 */
export function decryptPrivRecord(input: {
  keyring: PrivKeyring;
  family: PrivFamily;
  id: string;
  envelope: unknown;
}): unknown {
  const { keyring, family, id } = input;
  const parsed = privEnvelopeSchema.safeParse(input.envelope);
  if (!parsed.success) throw rejected('malformed');
  const envelope = parsed.data;
  const key = keyring.keys.find((candidate) => candidate.keyId === envelope.kid);
  if (!key) throw rejected('unknown_key');
  const nonce = base64UrlToBytes(envelope.nonce);
  if (nonce.length !== NONCE_BYTES) throw rejected('malformed');
  let plaintext: Uint8Array;
  try {
    plaintext = xchacha20poly1305(
      subkey(key.key, 'record'),
      nonce,
      privAad(keyring.ownerPubky, family, id, envelope.kid),
    ).decrypt(base64UrlToBytes(envelope.ct));
  } catch (error) {
    if (privEnvelopeRejection(error) !== null) throw error;
    throw rejected('unauthenticated');
  }
  try {
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw rejected('malformed');
  } finally {
    plaintext.fill(0);
  }
}
