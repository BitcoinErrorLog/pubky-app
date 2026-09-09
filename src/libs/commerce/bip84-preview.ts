import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hmac } from '@noble/hashes/hmac.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { BitcoinNetwork } from '@/libs/commerce/payment-methods';

/**
 * Watch-only BIP84 preview derivation (btc-mainnet design §B.6): from the
 * exact normalized 78 account-key bytes about to be POSTed, derive the
 * P2WPKH address the server will watch and the key fingerprint the server
 * reports back. Everything here operates on PUBLIC material only — BIP32
 * public child derivation (CKDpub) can never touch a private key.
 */

const HARDENED_OFFSET = 0x80000000;

/** Byte offsets inside the 78-byte extended-key serialization. */
const PARENT_FINGERPRINT_OFFSET = 5;
const CHILD_NUMBER_OFFSET = 9;
const CHAIN_CODE_OFFSET = 13;
const PUBLIC_KEY_OFFSET = 45;

/** A BIP32 public node: compressed public key + chain code. */
export interface HdPublicNode {
  publicKey: Uint8Array;
  chainCode: Uint8Array;
}

function ser32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = BigInt(0);
  for (const byte of bytes) value = (value << BigInt(8)) | BigInt(byte);
  return value;
}

export function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

/** BIP32 CKDpub for a non-hardened child index (public derivation only). */
export function derivePublicChild(parent: HdPublicNode, index: number): HdPublicNode {
  if (!Number.isInteger(index) || index < 0 || index >= HARDENED_OFFSET) {
    throw new RangeError('CKDpub only derives non-hardened child indexes');
  }
  const data = new Uint8Array(33 + 4);
  data.set(parent.publicKey, 0);
  data.set(ser32(index), 33);
  const digest = hmac(sha512, parent.chainCode, data);
  const tweak = bytesToBigInt(digest.subarray(0, 32));
  const childPoint = secp256k1.Point.fromBytes(parent.publicKey).add(secp256k1.Point.BASE.multiply(tweak));
  return { publicKey: childPoint.toBytes(true), chainCode: digest.subarray(32) };
}

// ---------------------------------------------------------------------------
// BIP173 bech32 (witness v0 — P2WPKH)
// ---------------------------------------------------------------------------

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values: number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) checksum ^= generators[i];
    }
  }
  return checksum;
}

function bech32HrpExpand(hrp: string): number[] {
  const expanded: number[] = [];
  for (const char of hrp) expanded.push(char.charCodeAt(0) >> 5);
  expanded.push(0);
  for (const char of hrp) expanded.push(char.charCodeAt(0) & 31);
  return expanded;
}

function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
  let accumulator = 0;
  let bits = 0;
  const result: number[] = [];
  const maxValue = (1 << toBits) - 1;
  for (const byte of data) {
    accumulator = (accumulator << fromBits) | byte;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((accumulator >> bits) & maxValue);
    }
  }
  if (pad && bits > 0) result.push((accumulator << (toBits - bits)) & maxValue);
  return result;
}

export type Bech32Hrp = 'bc' | 'tb' | 'bcrt';

/** The bech32 human-readable part for each configured network. */
export const BECH32_HRP_BY_NETWORK: Record<BitcoinNetwork, Bech32Hrp> = {
  mainnet: 'bc',
  testnet: 'tb',
  regtest: 'bcrt',
};

/** Bech32-encode a witness-v0 program (BIP173; enough for P2WPKH). */
export function bech32EncodeWitnessV0(hrp: Bech32Hrp, witnessProgram: Uint8Array): string {
  const data = [0, ...convertBits(witnessProgram, 8, 5, true)];
  const values = [...bech32HrpExpand(hrp), ...data];
  const polymod = bech32Polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((polymod >>> (5 * (5 - i))) & 31);
  return hrp + '1' + [...data, ...checksum].map((value) => BECH32_CHARSET[value]).join('');
}

// ---------------------------------------------------------------------------
// Preview address, key fingerprint, and claim-response verification
// ---------------------------------------------------------------------------

/** The public node carried by a normalized 78-byte account-key serialization. */
export function accountNodeFromBytes(normalizedBytes: Uint8Array): HdPublicNode {
  return {
    chainCode: normalizedBytes.subarray(CHAIN_CODE_OFFSET, CHAIN_CODE_OFFSET + 32),
    publicKey: normalizedBytes.subarray(PUBLIC_KEY_OFFSET, PUBLIC_KEY_OFFSET + 33),
  };
}

/**
 * Derive the BIP84 P2WPKH address at `<change>/<childIndex>` from the exact
 * normalized 78 account-key bytes — never from the pasted string. The claim
 * preview is `0/0`; the server-comparison address is `0/<next_child_index>`.
 */
export function deriveBip84P2wpkhAddress(
  normalizedBytes: Uint8Array,
  network: BitcoinNetwork,
  childIndex: number,
  change = 0,
): string {
  const branch = derivePublicChild(accountNodeFromBytes(normalizedBytes), change);
  const leaf = derivePublicChild(branch, childIndex);
  return bech32EncodeWitnessV0(BECH32_HRP_BY_NETWORK[network], hash160(leaf.publicKey));
}

/**
 * The claim-response `key_fingerprint`: hex of the first 8 bytes of SHA-256
 * over the canonical 78 bytes (design §B.6 — computed over exactly what the
 * server stores, so a SLIP-132 rewrite cannot change it).
 */
export function accountKeyFingerprint(normalizedBytes: Uint8Array): string {
  return bytesToHex(sha256(normalizedBytes).subarray(0, 8));
}

/** The hardened account index the normalized key itself declares (m/84'/c'/n'). */
export function accountIndexFromBytes(normalizedBytes: Uint8Array): number {
  const view = new DataView(normalizedBytes.buffer, normalizedBytes.byteOffset);
  return view.getUint32(CHILD_NUMBER_OFFSET, false) - HARDENED_OFFSET;
}

/** The four W1.3 claim-response fields the client verifies against. */
export interface ClaimedAccountDetails {
  /** Server-reported account index; must be a bounded integer 0–99. */
  accountIndex: number;
  /** `key_fingerprint` — null when the server predates W1.3. */
  keyFingerprint: string | null;
  /** `first_derived_address` — the address at `0/<next_child_index>`. */
  firstDerivedAddress: string | null;
  /** `next_child_index` — the scanned start index the server will watch from. */
  nextChildIndex: number | null;
  /** `stack_id` — the paykit-server stack identity (W1.3). */
  stackId: string | null;
}

export type ClaimVerificationRejectionReason =
  | 'server_fingerprint_missing'
  | 'server_fingerprint_mismatch'
  | 'server_address_mismatch';

export type ClaimVerification = { ok: true } | { ok: false; reason: ClaimVerificationRejectionReason };

/** The server's documented account-index bound (design §B.6: 0–99). */
const MAX_ACCOUNT_INDEX = 99;

/**
 * The confirmation gate: refuse to enable `bitcoinEnabled` unless the
 * server's claim response proves it stored exactly the key that was POSTed.
 * Fail-closed on every gap — a missing fingerprint means the server predates
 * W1.3 and must be deployed first.
 */
export function verifyClaimedAccount(
  normalizedBytes: Uint8Array,
  network: BitcoinNetwork,
  claim: ClaimedAccountDetails,
): ClaimVerification {
  // Missing W1.3 fields: the server is too old to be trusted with a claim.
  if (!claim.keyFingerprint || !claim.stackId) return { ok: false, reason: 'server_fingerprint_missing' };
  if (claim.keyFingerprint !== accountKeyFingerprint(normalizedBytes)) {
    return { ok: false, reason: 'server_fingerprint_mismatch' };
  }
  if (
    claim.nextChildIndex === null ||
    !Number.isInteger(claim.nextChildIndex) ||
    claim.nextChildIndex < 0 ||
    claim.nextChildIndex >= HARDENED_OFFSET ||
    !claim.firstDerivedAddress ||
    !Number.isInteger(claim.accountIndex) ||
    claim.accountIndex < 0 ||
    claim.accountIndex > MAX_ACCOUNT_INDEX
  ) {
    return { ok: false, reason: 'server_address_mismatch' };
  }
  const expected = deriveBip84P2wpkhAddress(normalizedBytes, network, claim.nextChildIndex);
  if (claim.firstDerivedAddress !== expected) return { ok: false, reason: 'server_address_mismatch' };
  return { ok: true };
}

/** The BIP32 parent-fingerprint bytes the key itself declares (origin info). */
export function parentFingerprintFromBytes(normalizedBytes: Uint8Array): Uint8Array {
  return normalizedBytes.subarray(PARENT_FINGERPRINT_OFFSET, PARENT_FINGERPRINT_OFFSET + 4);
}
