import { getPubchiDatabase } from '@/database/pubchi/pubchi';
import { DatabaseErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { rememberPendingDelegationDeletes } from './pending-delegation-deletes';
import { bytesToHex } from './schemas/canonical';

const SPKI_PREFIX_LENGTH = 12;
const Z32_ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769';
export const DEVICE_DELEGATION_MAX_SECONDS = 30 * 24 * 60 * 60;
export const DEVICE_DELEGATION_REFRESH_SECONDS = 3 * 24 * 60 * 60;
const LEGACY_CURRENT_DEVICE_SIGNER_KEY = 'pubchi.deviceSigner';
const DEVICE_MINT_LOCK = 'pubchi-device-mint';
const deviceMintLocks = new Map<string, Promise<StoredDeviceKey>>();

export type StoredDeviceKey = {
  id: string;
  owner: string;
  signer: string;
  key: CryptoKey;
  created_at: number;
  expires_at: number;
};

async function signerForKey(key: CryptoKey): Promise<string> {
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', key));
  return z32Encode(spki.slice(SPKI_PREFIX_LENGTH));
}

function z32Encode(bytes: Uint8Array): string {
  let buffer = 0;
  let bits = 0;
  let output = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += Z32_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) output += Z32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

export async function generateDeviceKey(): Promise<{ key: CryptoKey; signer: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
  return { key: pair.privateKey, signer: await signerForKey(pair.publicKey) };
}

export async function getDeviceKeys(owner: string): Promise<StoredDeviceKey[]> {
  return await getPubchiDatabase().deviceKeys.where('owner').equals(owner).toArray();
}

export async function getCurrentDeviceKey(owner: string, now = Math.floor(Date.now() / 1000)) {
  const keys = await getDeviceKeys(owner);
  if (typeof localStorage === 'undefined') return undefined;
  const ownerKey = `pubchi.deviceSigner:${owner}`;
  let signer = localStorage.getItem(ownerKey);
  const legacySigner = localStorage.getItem(LEGACY_CURRENT_DEVICE_SIGNER_KEY);
  if (!signer && legacySigner && keys.some((key) => key.signer === legacySigner)) {
    localStorage.setItem(ownerKey, legacySigner);
    localStorage.removeItem(LEGACY_CURRENT_DEVICE_SIGNER_KEY);
    signer = legacySigner;
  }
  return keys.find((key) => key.expires_at > now && key.signer === signer);
}

export async function loadOrGenerateDeviceKey(
  owner: string,
  now = Math.floor(Date.now() / 1000),
): Promise<StoredDeviceKey> {
  const inFlight = deviceMintLocks.get(owner);
  if (inFlight) return inFlight;
  const mint = mintDeviceKey(owner, now);
  deviceMintLocks.set(owner, mint);
  try {
    return await mint;
  } finally {
    if (deviceMintLocks.get(owner) === mint) deviceMintLocks.delete(owner);
  }
}

async function mintDeviceKey(owner: string, now: number): Promise<StoredDeviceKey> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (locks) {
    return locks.request(DEVICE_MINT_LOCK, () => mintDeviceKeyWithoutLock(owner, now));
  }
  return mintDeviceKeyWithoutLock(owner, now);
}

async function mintDeviceKeyWithoutLock(owner: string, now: number): Promise<StoredDeviceKey> {
  const current = await getCurrentDeviceKey(owner, now);
  if (current && current.expires_at - now > DEVICE_DELEGATION_REFRESH_SECONDS) return current;
  if (current) {
    if (!rememberPendingDelegationDeletes([{ owner, signer: current.signer }])) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Could not persist expiring Pubchi device deletion', {
        service: ErrorService.Pubchi,
        operation: 'loadOrGenerateDeviceKey',
      });
    }
    await getPubchiDatabase().deviceKeys.delete(current.id);
  }

  const live = (await getDeviceKeys(owner)).filter((key) => key.expires_at > now);
  if (live.length >= 3) {
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DEVICE_LIMIT', {
      service: ErrorService.Pubchi,
      operation: 'loadOrGenerateDeviceKey',
    });
  }

  const generated = await generateDeviceKey();
  const record: StoredDeviceKey = {
    id: `${owner}:${generated.signer}`,
    owner,
    signer: generated.signer,
    key: generated.key,
    created_at: now,
    expires_at: now + DEVICE_DELEGATION_MAX_SECONDS,
  };
  await getPubchiDatabase().deviceKeys.put(record);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`pubchi.deviceSigner:${owner}`, record.signer);
    localStorage.removeItem(LEGACY_CURRENT_DEVICE_SIGNER_KEY);
  }
  return record;
}

export async function signWithDeviceKey(key: CryptoKey, message: Uint8Array): Promise<string> {
  if (key.type !== 'private' || key.algorithm.name !== 'Ed25519') {
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DEVICE_KEY_REQUIRED', {
      service: ErrorService.Pubchi,
      operation: 'signWithDeviceKey',
    });
  }
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, key, new Uint8Array(message));
  return bytesToHex(new Uint8Array(signature));
}

export async function deleteDeviceKey(owner: string, signer: string): Promise<void> {
  await getPubchiDatabase().deviceKeys.delete(`${owner}:${signer}`);
}

/**
 * Drop local device keys that do not belong to the signed-in owner.
 * Does not touch homeserver objects: a previous identity's published
 * delegation can only be DELETEd with that identity's live session.
 */
export async function listDeviceKeysNotOwnedBy(owner: string): Promise<StoredDeviceKey[]> {
  return (await getPubchiDatabase().deviceKeys.toArray()).filter((row) => row.owner !== owner);
}

export async function wipeDeviceKeysNotOwnedBy(owner: string): Promise<number> {
  const foreign = await listDeviceKeysNotOwnedBy(owner);
  await Promise.all(foreign.map((row) => getPubchiDatabase().deviceKeys.delete(row.id)));
  return foreign.length;
}
