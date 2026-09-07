import { getPubchiDatabase } from '@/database/pubchi/pubchi';
import { bytesToHex } from './schemas/canonical';

const SPKI_PREFIX_LENGTH = 12;
const Z32_ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769';
export const DEVICE_DELEGATION_MAX_SECONDS = 30 * 24 * 60 * 60;
export const DEVICE_DELEGATION_REFRESH_SECONDS = 3 * 24 * 60 * 60;
const CURRENT_DEVICE_SIGNER_KEY = 'pubchi.deviceSigner';

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
  const signer = typeof localStorage === 'undefined' ? undefined : localStorage.getItem(CURRENT_DEVICE_SIGNER_KEY);
  return keys.find((key) => key.expires_at > now && key.signer === signer);
}

export async function loadOrGenerateDeviceKey(owner: string, now = Math.floor(Date.now() / 1000)): Promise<StoredDeviceKey> {
  const current = await getCurrentDeviceKey(owner, now);
  if (current && current.expires_at - now > DEVICE_DELEGATION_REFRESH_SECONDS) return current;
  if (current) await getPubchiDatabase().deviceKeys.delete(current.id);

  const live = (await getDeviceKeys(owner)).filter((key) => key.expires_at > now);
  if (live.length >= 3) throw new Error('PUBCHI_DEVICE_LIMIT');

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
  if (typeof localStorage !== 'undefined') localStorage.setItem(CURRENT_DEVICE_SIGNER_KEY, record.signer);
  return record;
}

export async function signWithDeviceKey(key: CryptoKey, message: Uint8Array): Promise<string> {
  if (key.type !== 'private' || key.algorithm.name !== 'Ed25519') throw new Error('PUBCHI_DEVICE_KEY_REQUIRED');
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, key, new Uint8Array(message));
  return bytesToHex(new Uint8Array(signature));
}

export async function deleteDeviceKey(owner: string, signer: string): Promise<void> {
  await getPubchiDatabase().deviceKeys.delete(`${owner}:${signer}`);
}
