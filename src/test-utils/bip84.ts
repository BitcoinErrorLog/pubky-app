import { secp256k1 } from '@noble/curves/secp256k1.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import * as bip39 from 'bip39';
import {
  accountNodeFromBytes,
  bech32EncodeWitnessV0,
  derivePublicChild,
  hash160,
  type HdPublicNode,
} from '@/libs/commerce/bip84-preview';

/**
 * Test-only BIP32/BIP84 derivation used to recompute deny-list entries and
 * claim-flow fixtures from published test vectors. This is NOT product key
 * handling — the app's identity code is Ed25519; this exists so the
 * payment-methods tests can derive BIP84 account keys and P2WPKH addresses
 * from a mnemonic and assert them against the published BIP84 literals.
 * Public derivation (CKDpub) and bech32 encoding are REUSED from the
 * production preview module (`@/libs/commerce/bip84-preview`) so the tests
 * and the shipped claim gate can never drift apart; only the private
 * derivation from the mnemonic is test-only.
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
// Address fixtures — reuse the production preview derivation, so the test
// vectors and the shipped claim gate are asserted against one code path.
// ---------------------------------------------------------------------------

/** Derive the BIP84 receiving address at 0/<index> (P2WPKH bech32). */
export function deriveBip84AddressAtIndex(account: Bip84AccountKey, hrp: 'bc' | 'tb', index: number): string {
  const external = derivePublicChild({ publicKey: account.publicKey, chainCode: account.chainCode }, 0);
  const leaf = derivePublicChild(external, index);
  return bech32EncodeWitnessV0(hrp, hash160(leaf.publicKey));
}

/** Derive the BIP84 first receiving address (m/84'/c'/a'/0/0, P2WPKH bech32). */
export function deriveBip84FirstAddress(account: Bip84AccountKey, hrp: 'bc' | 'tb'): string {
  return deriveBip84AddressAtIndex(account, hrp, 0);
}

/** The public node (chain code + public key) of a derived account, for cross-checks. */
export function accountPublicNode(account: Bip84AccountKey): HdPublicNode {
  return accountNodeFromBytes(account.payload);
}
