import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hmac } from '@noble/hashes/hmac.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import * as bip39 from 'bip39';

/**
 * Test-only BIP32/BIP84 derivation used to recompute deny-list entries and
 * claim-flow fixtures from published test vectors. This is NOT product key
 * handling — the app's identity code is Ed25519; this exists so the
 * payment-methods tests can derive BIP84 account keys and P2WPKH addresses
 * from a mnemonic and assert them against the published BIP84 literals.
 */

const HARDENED_OFFSET = 0x80000000;
const CURVE_ORDER = secp256k1.Point.CURVE().n;

/** BIP32 canonical and SLIP-132 BIP84 (P2WPKH) extended-key version bytes. */
export const BIP84_VERSION_BYTES = {
  xpub: 0x0488b21e,
  zpub: 0x04b24746,
  tpub: 0x043587cf,
  vpub: 0x045f1cf6,
} as const;

export type Bip84CoinType = 0 | 1;

function ser32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

function ser256(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let remaining = value;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(remaining & BigInt(0xff));
    remaining >>= BigInt(8);
  }
  return out;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = BigInt(0);
  for (const byte of bytes) value = (value << BigInt(8)) | BigInt(byte);
  return value;
}

function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

interface HdPrivateNode {
  privateKey: bigint;
  publicKey: Uint8Array;
  chainCode: Uint8Array;
}

// 'Bitcoin seed' as literal bytes — avoids TextEncoder, which under the jsdom
// test environment produces cross-realm Uint8Arrays that @noble rejects.
const BIP32_MASTER_KEY = Uint8Array.from([66, 105, 116, 99, 111, 105, 110, 32, 115, 101, 101, 100]);

function toLocalBytes(bytes: Uint8Array): Uint8Array {
  // bip39 may yield a Buffer or a cross-realm Uint8Array under jsdom; re-create
  // in the current realm so @noble's `instanceof Uint8Array` checks hold.
  return Uint8Array.from(bytes);
}

function masterNode(seed: Uint8Array): HdPrivateNode {
  const digest = hmac(sha512, BIP32_MASTER_KEY, toLocalBytes(seed));
  const privateKey = bytesToBigInt(digest.subarray(0, 32));
  return { privateKey, publicKey: secp256k1.getPublicKey(ser256(privateKey), true), chainCode: digest.subarray(32) };
}

/** BIP32 CKDpriv for a hardened child index. */
function deriveHardenedChild(parent: HdPrivateNode, index: number): HdPrivateNode {
  const data = new Uint8Array(1 + 32 + 4);
  data.set(ser256(parent.privateKey), 1);
  data.set(ser32(index + HARDENED_OFFSET), 33);
  const digest = hmac(sha512, parent.chainCode, data);
  const tweak = bytesToBigInt(digest.subarray(0, 32));
  const privateKey = (tweak + parent.privateKey) % CURVE_ORDER;
  return { privateKey, publicKey: secp256k1.getPublicKey(ser256(privateKey), true), chainCode: digest.subarray(32) };
}

interface HdPublicNode {
  publicKey: Uint8Array;
  chainCode: Uint8Array;
}

/** BIP32 CKDpub for a non-hardened child index. */
function derivePublicChild(parent: HdPublicNode, index: number): HdPublicNode {
  const data = new Uint8Array(33 + 4);
  data.set(parent.publicKey, 0);
  data.set(ser32(index), 33);
  const digest = hmac(sha512, parent.chainCode, data);
  const tweak = bytesToBigInt(digest.subarray(0, 32));
  const childPoint = secp256k1.Point.fromBytes(parent.publicKey).add(secp256k1.Point.BASE.multiply(tweak));
  return { publicKey: childPoint.toBytes(true), chainCode: digest.subarray(32) };
}

function fingerprint(publicKey: Uint8Array): Uint8Array {
  return hash160(publicKey).subarray(0, 4);
}

export interface Bip84AccountKey {
  /**
   * The canonical 78-byte extended-public-key serialization of the account
   * node (m/84'/coinType'/accountIndex'), version bytes set to `xpub` for
   * coin type 0 and `tpub` for coin type 1. Rewriting the leading four bytes
   * to the SLIP-132 `zpub`/`vpub` values yields the wallet-export form.
   */
  payload: Uint8Array;
  publicKey: Uint8Array;
  chainCode: Uint8Array;
}

/** Derive the BIP84 account node m/84'/coinType'/accountIndex' from a BIP39 mnemonic. */
export function deriveBip84Account(mnemonic: string, coinType: Bip84CoinType, accountIndex: number): Bip84AccountKey {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const purpose = deriveHardenedChild(masterNode(seed), 84);
  const coin = deriveHardenedChild(purpose, coinType);
  const account = deriveHardenedChild(coin, accountIndex);

  const payload = new Uint8Array(78);
  const view = new DataView(payload.buffer);
  view.setUint32(0, coinType === 0 ? BIP84_VERSION_BYTES.xpub : BIP84_VERSION_BYTES.tpub, false);
  payload[4] = 3; // depth: m/84'/c'/a'
  payload.set(fingerprint(coin.publicKey), 5);
  view.setUint32(9, accountIndex + HARDENED_OFFSET, false);
  payload.set(account.chainCode, 13);
  payload.set(account.publicKey, 45);

  return { payload, publicKey: account.publicKey, chainCode: account.chainCode };
}

// ---------------------------------------------------------------------------
// BIP173 bech32 (witness v0 only — enough for P2WPKH first-address fixtures)
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

function bech32Encode(hrp: string, witnessVersion: number, witnessProgram: Uint8Array): string {
  const data = [witnessVersion, ...convertBits(witnessProgram, 8, 5, true)];
  const values = [...bech32HrpExpand(hrp), ...data];
  const polymod = bech32Polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((polymod >>> (5 * (5 - i))) & 31);
  return hrp + '1' + [...data, ...checksum].map((value) => BECH32_CHARSET[value]).join('');
}

/** Derive the BIP84 first receiving address (m/84'/c'/a'/0/0, P2WPKH bech32). */
export function deriveBip84FirstAddress(account: Bip84AccountKey, hrp: 'bc' | 'tb'): string {
  const external = derivePublicChild({ publicKey: account.publicKey, chainCode: account.chainCode }, 0);
  const first = derivePublicChild(external, 0);
  return bech32Encode(hrp, 0, hash160(first.publicKey));
}
