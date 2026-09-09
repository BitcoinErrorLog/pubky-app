import * as bip39 from 'bip39';
import { accountIndexFromBytes } from '@/libs/commerce/bip84-preview';
import {
  type AccountXpubRejectionReason,
  type BitcoinNetwork,
  normalizeAccountXpub,
} from '@/libs/commerce/payment-methods';

/**
 * §C.10 file import for the watch-only claim: the accepted artifacts (plain
 * text with one key, a single-sig `wpkh` output descriptor, a Coldcard-style
 * generic JSON export) all reduce to the same normalized 78 bytes through
 * the W1.7 validator — one claim path, whatever the container. Anything that
 * looks like private key material is refused loudly, and nothing in this
 * module ever logs, toasts, or persists file contents or keys.
 */

/** Files above this cap are refused before their contents are read fully. */
export const ACCOUNT_KEY_FILE_MAX_BYTES = 16 * 1024;

export type AccountKeyFileRejectionReason =
  | 'file_too_large'
  | 'private_key_material'
  | 'descriptor_account_mismatch'
  | 'unsupported_script_type'
  | 'unsupported_derivation_range'
  | 'unrecognized_file';

/** File-level reasons plus every validator reason the wrapped key can produce. */
export type AccountKeyFileRejection = AccountKeyFileRejectionReason | AccountXpubRejectionReason;

export type AccountKeyFileParseResult =
  | { ok: true; xpub: string; bytes: Uint8Array }
  | { ok: false; reason: AccountKeyFileRejection };

/**
 * Static copy per named file-import refusal. The validator's own reasons
 * reuse `CLAIM_REJECTION_COPY` from the claim hook. Never interpolate file
 * contents or keys into these strings.
 */
export const ACCOUNT_KEY_FILE_REJECTION_COPY: Record<AccountKeyFileRejectionReason, string> = {
  file_too_large: 'That file is too large to be an account-key export. Export just the account xpub, or paste it.',
  private_key_material:
    'That file contains private key material — a seed phrase or private key must never be uploaded here. Export the watch-only account xpub instead.',
  descriptor_account_mismatch:
    'The descriptor’s derivation path does not match the account the key declares. Export the descriptor for the same BIP84 account you want Shop to watch.',
  unsupported_script_type:
    'Only a single-signature native-segwit (wpkh) descriptor works here. Export the BIP84 account descriptor, or paste the account xpub.',
  unsupported_derivation_range:
    'Only a descriptor with the external-chain /0/* range works here. Export the BIP84 account descriptor, or paste the account xpub.',
  unrecognized_file:
    'That file is not a recognized account-key export. Use a plain xpub text file, a wpkh descriptor, or a wallet JSON export — or paste the account xpub.',
};

// ---------------------------------------------------------------------------
// Private-key-material detection (refuse loudly, never log contents)
// ---------------------------------------------------------------------------

/** Base58check extended private keys, anywhere in the content. */
const EXTENDED_PRIVATE_KEY_RE = /(?:xprv|yprv|zprv|tprv|vprv)[1-9A-HJ-NP-Za-km-z]{20,}/;

const ENGLISH_WORDLIST = new Set(bip39.wordlists.english as string[]);

/**
 * Anything that looks like wallet secret material: an extended private key
 * (including inside a descriptor or JSON backup), or a 12/24-word run of
 * BIP39 English words (a mnemonic, plain or embedded in a backup file).
 */
export function looksLikePrivateKeyMaterial(content: string): boolean {
  if (EXTENDED_PRIVATE_KEY_RE.test(content)) return true;
  const words = content.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const length of [12, 24]) {
    for (let start = 0; start + length <= words.length; start++) {
      let all = true;
      for (let i = start; i < start + length; i++) {
        if (!ENGLISH_WORDLIST.has(words[i])) {
          all = false;
          break;
        }
      }
      if (all) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// BIP380 descriptor checksum (Bitcoin Core's algorithm, GF(32) cyclic code)
// ---------------------------------------------------------------------------

const DESCRIPTOR_INPUT_CHARSET =
  "0123456789()[],'/*abcdefgh@:$%{}" + 'IJKLMNOPQRSTUVWXYZ&+-.;<=>?!^_|~' + 'ijklmnopqrstuvwxyzABCDEFGH`#"\\ ';
const DESCRIPTOR_CHECKSUM_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
// BigInt via the constructor — the tsconfig target predates ES2020 literals.
const DESCRIPTOR_GENERATORS = [
  BigInt('0xf5dee51989'),
  BigInt('0xa9fdca3312'),
  BigInt('0x1bab10e32d'),
  BigInt('0x3706b1677a'),
  BigInt('0x644d626ffd'),
];
const POLYMOD_TOP_SHIFT = BigInt(35);
const POLYMOD_LOW_MASK = BigInt('0x7ffffffff');

function descriptorPolyMod(checksum: bigint, value: number): bigint {
  const top = checksum >> POLYMOD_TOP_SHIFT;
  let next = ((checksum & POLYMOD_LOW_MASK) << BigInt(5)) ^ BigInt(value);
  for (let i = 0; i < 5; i++) {
    if ((top >> BigInt(i)) & BigInt(1)) next ^= DESCRIPTOR_GENERATORS[i];
  }
  return next;
}

/** The 8-character BIP380 checksum of a descriptor body (no `#` suffix). */
export function descriptorChecksum(body: string): string | null {
  let checksum = BigInt(1);
  let group = 0;
  let groupCount = 0;
  for (const char of body) {
    const position = DESCRIPTOR_INPUT_CHARSET.indexOf(char);
    if (position === -1) return null;
    checksum = descriptorPolyMod(checksum, position & 31);
    group = group * 3 + (position >> 5);
    if (++groupCount === 3) {
      checksum = descriptorPolyMod(checksum, group);
      group = 0;
      groupCount = 0;
    }
  }
  if (groupCount > 0) checksum = descriptorPolyMod(checksum, group);
  for (let i = 0; i < 8; i++) checksum = descriptorPolyMod(checksum, 0);
  checksum ^= BigInt(1);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += DESCRIPTOR_CHECKSUM_CHARSET[Number((checksum >> BigInt(5 * (7 - i))) & BigInt(31))];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Artifact parsers
// ---------------------------------------------------------------------------

/** Descriptor functions that are never acceptable on this P2WPKH-only rail. */
const UNSUPPORTED_DESCRIPTOR_FUNCTIONS = new Set([
  'pkh',
  'sh',
  'wsh',
  'tr',
  'rawtr',
  'pk',
  'multi',
  'sortedmulti',
  'combo',
  'addr',
  'raw',
  'musig',
]);

/**
 * The accepted shape: `wpkh([fingerprint/84h/{0|1}h/Nh]KEY/0/*)#checksum`.
 * Parsed loosely first so each deviation can carry its own named reason.
 */
const WPKH_DESCRIPTOR_RE =
  /^wpkh\((?:\[([0-9a-fA-F]{8}((?:\/[0-9]+[hH'])+))\])?([1-9A-HJ-NP-Za-km-z]+)((?:\/[0-9*]+[hH']?)*)\)(?:#([a-z0-9]{8}))?$/;

function parseDescriptor(text: string, network: BitcoinNetwork | undefined): AccountKeyFileParseResult {
  const hashIndex = text.lastIndexOf('#');
  const body = hashIndex === -1 ? text : text.slice(0, hashIndex);
  const fnMatch = /^([a-z]+)\(/.exec(body.trim());
  if (!fnMatch) return { ok: false, reason: 'unrecognized_file' };
  const fn = fnMatch[1];
  if (fn !== 'wpkh') {
    return {
      ok: false,
      reason: UNSUPPORTED_DESCRIPTOR_FUNCTIONS.has(fn) ? 'unsupported_script_type' : 'unrecognized_file',
    };
  }

  const match = WPKH_DESCRIPTOR_RE.exec(text);
  if (!match) {
    // A wpkh() that does not fit the single-key shape at all (multisig
    // arguments, key expressions we do not accept) is unrecognizable, not
    // something to guess at.
    return { ok: false, reason: 'unrecognized_file' };
  }
  const [, originPath, , key, derivationSuffix, checksum] = match;

  if (derivationSuffix !== '/0/*') return { ok: false, reason: 'unsupported_derivation_range' };

  // The wrapped key validates first, so an unconfigured network refuses with
  // `bitcoin_network_unconfigured` regardless of the container.
  const normalized = normalizeAccountXpub(key, network);
  if (!normalized.ok) return normalized;

  if (!originPath) {
    // Without the key-origin block the account index cannot be cross-checked
    // against the path — refuse rather than guess (§C.10).
    return { ok: false, reason: 'descriptor_account_mismatch' };
  }
  const segments = originPath.split('/').slice(1);
  const path = segments.map((segment) => /^([0-9]+)[hH']$/.exec(segment)?.[1]);
  const expectedCoinType = network === 'mainnet' ? '0' : '1';
  if (
    path.length !== 3 ||
    path.some((value) => value === undefined) ||
    path[0] !== '84' ||
    path[1] !== expectedCoinType
  ) {
    return { ok: false, reason: 'descriptor_account_mismatch' };
  }

  // The origin path's account N must agree with the hardened account index
  // the key itself declares (design §B.6 — the server cross-checks the same).
  if (accountIndexFromBytes(normalized.bytes) !== Number(path[2])) {
    return { ok: false, reason: 'descriptor_account_mismatch' };
  }

  if (!checksum || descriptorChecksum(body) !== checksum) return { ok: false, reason: 'unrecognized_file' };
  return { ok: true, xpub: normalized.xpub, bytes: normalized.bytes };
}

const BIP84_DERIV_RE = /^m\/84'\/([01])'\/([0-9]+)'$/;

function parseGenericJson(text: string, network: BitcoinNetwork | undefined): AccountKeyFileParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'unrecognized_file' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'unrecognized_file' };
  // Coldcard-style generic export: the bip84 object carries the account xpub
  // and its derivation path; every other script type in the file is ignored.
  const bip84 = (parsed as Record<string, unknown>).bip84;
  if (!bip84 || typeof bip84 !== 'object') return { ok: false, reason: 'unrecognized_file' };
  const xpub = (bip84 as Record<string, unknown>).xpub;
  if (typeof xpub !== 'string') return { ok: false, reason: 'unrecognized_file' };
  const normalized = normalizeAccountXpub(xpub, network);
  if (!normalized.ok) return normalized;
  const deriv = (bip84 as Record<string, unknown>).deriv;
  if (deriv !== undefined) {
    if (typeof deriv !== 'string') return { ok: false, reason: 'unrecognized_file' };
    const match = BIP84_DERIV_RE.exec(deriv);
    if (!match) return { ok: false, reason: 'unrecognized_file' };
    const expectedCoinType = network === 'mainnet' ? '0' : '1';
    if (match[1] !== expectedCoinType || accountIndexFromBytes(normalized.bytes) !== Number(match[2])) {
      return { ok: false, reason: 'descriptor_account_mismatch' };
    }
  }
  return { ok: true, xpub: normalized.xpub, bytes: normalized.bytes };
}

/**
 * Reduce an accepted §C.10 artifact to the normalized 78 bytes the claim
 * POSTs. `network` comes from the configured runtime — when it is
 * unconfigured the wrapped validator refuses with
 * `bitcoin_network_unconfigured`.
 */
export function parseAccountKeyFile(content: string, network: BitcoinNetwork | undefined): AccountKeyFileParseResult {
  // Character length bounds byte length for the ASCII formats at stake, so
  // this refuses oversize content even if a caller skipped the pre-read cap.
  if (content.length > ACCOUNT_KEY_FILE_MAX_BYTES) return { ok: false, reason: 'file_too_large' };
  const text = content.trim();
  if (!text) return { ok: false, reason: 'unrecognized_file' };
  // Refuse loudly before any parsing: secrets never proceed, never log.
  if (looksLikePrivateKeyMaterial(text)) return { ok: false, reason: 'private_key_material' };

  if (text.startsWith('{')) return parseGenericJson(text, network);
  if (/^[a-z]+\(/.test(text)) return parseDescriptor(text, network);

  // Plain-text export: exactly one key, nothing else on the page.
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return { ok: false, reason: 'unrecognized_file' };
  return normalizeAccountXpub(tokens[0], network);
}
