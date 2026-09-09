import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

/**
 * Seller-configurable payment methods (docs/ecommerce/fiat-rails-phase1.md,
 * "seller-direct" custody decision): the seller owns every processor
 * relationship. This marketplace never receives funds on any rail —
 * bitcoin settles to the seller's own claimed watch-only account via
 * Paykit, and fiat settles into the seller's own Stripe/PayPal account.
 * The service only verifies (Stripe, via a seller-supplied restricted
 * read-only key) or records attestations (PayPal, buyer-reported and
 * seller-confirmed).
 */
export type PaymentMethodKind = 'bitcoin' | 'stripe' | 'paypal';

/**
 * Public view of one seller's payment configuration, served unauthenticated
 * so buyers can see the available methods before committing. The Stripe
 * restricted key is write-only on the service and never appears here.
 */
export const sellerPaymentConfigSchema = z.object({
  bitcoinAvailable: z.boolean(),
  stripePaymentLink: z.url().nullable(),
  paypalMerchantEmail: z.email().nullable(),
});

export type SellerPaymentConfig = z.infer<typeof sellerPaymentConfigSchema>;

/** Methods the buyer can actually choose, in the order the UI renders them. */
export function availablePaymentMethods(config: SellerPaymentConfig): PaymentMethodKind[] {
  const methods: PaymentMethodKind[] = [];
  if (config.bitcoinAvailable) methods.push('bitcoin');
  if (config.stripePaymentLink) methods.push('stripe');
  if (config.paypalMerchantEmail) methods.push('paypal');
  return methods;
}

/**
 * Stripe Payment Links are the seller-direct checkout surface: the seller
 * creates the link in their own Stripe dashboard, so only Stripe-hosted
 * link hosts are accepted — anything else could smuggle an arbitrary
 * redirect into the buyer flow.
 */
const STRIPE_PAYMENT_LINK_HOSTS = new Set(['buy.stripe.com', 'book.stripe.com']);

export function isStripePaymentLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && STRIPE_PAYMENT_LINK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * The seller's own view when editing the configuration. Mirrors the
 * service's `payment_config` response: the Stripe restricted key is
 * write-only, so only its presence flag ever comes back.
 */
export const sellerPaymentConfigOwnViewSchema = z.object({
  bitcoinEnabled: z.boolean(),
  stripePaymentLink: z.url().nullable(),
  paypalMerchantEmail: z.email().nullable(),
  stripeRestrictedKeySet: z.boolean(),
  updatedAt: z.string(),
});

export type SellerPaymentConfigOwnView = z.infer<typeof sellerPaymentConfigOwnViewSchema>;

/**
 * The verified watch-only claim that gates `bitcoinEnabled` (btc-mainnet
 * design §B.6/§B.8): written ONLY by the two verification paths — a session
 * claim whose response verified against the exact normalized bytes POSTed
 * (`session_claim`), or the authenticated `GET /v0/accounts/{creator}/status`
 * read approved in Ring (`authenticated_status`). The stored
 * `bitcoinEnabled` flag is a hint, never authority; this record is the gate.
 *
 * `xpub` is the normalized canonical account xpub the claim verified against
 * — `null` for a Ring-verified status read when the client holds no local key
 * (a Bitkit-set-up seller): the server's `keyFingerprintHex` +
 * `firstDerivedAddress` are the identity the seller enabled, and the gate
 * re-opens only by re-verifying. `accountIndex` is the key-declared hardened
 * index when a local key exists, `null` otherwise.
 */
export const verifiedPaykitClaimSchema = z.object({
  xpub: z.string().nullable(),
  keyFingerprintHex: z.string(),
  accountIndex: z.number().int().nullable(),
  firstDerivedAddress: z.string(),
  verifiedAt: z.number(),
  source: z.enum(['session_claim', 'authenticated_status']),
  // W1.13 r3 claim/status fields. Null on a record written before W1.8c (or
  // by a pre-W1.13 server) — reads coalesce a missing column to null.
  firstChildIndex: z.number().int().nullable(),
  allocationMode: z.string().nullable(),
  claimChannel: z.string().nullable(),
  downgradeReason: z.string().nullable(),
});

export type VerifiedPaykitClaim = z.infer<typeof verifiedPaykitClaimSchema>;

/**
 * Seller-supplied Stripe restricted keys start with `rk_`; secret `sk_`
 * keys are refused by the service, and this mirror check keeps a pasted
 * secret key from ever leaving the browser.
 */
export function isStripeRestrictedKey(value: string): boolean {
  return /^rk_(test|live)_[0-9A-Za-z]{8,}$/.test(value.trim());
}

// ---------------------------------------------------------------------------
// Network-aware BIP84 account-xpub validation (btc-mainnet design §B.6, §C row 9)
// ---------------------------------------------------------------------------

/**
 * The Bitcoin network this deployment's payment rails settle on, sourced from
 * `PUBKY_RUNTIME_BITCOIN_NETWORK` — NEVER derived from `PUBKY_RUNTIME_ENV` or
 * the `testnet` network flag. Unset or unrecognised means unconfigured: the
 * client refuses to submit an xpub claim and never guesses a network.
 */
export type BitcoinNetwork = 'mainnet' | 'testnet' | 'regtest';

export function parseBitcoinNetwork(value: string | undefined): BitcoinNetwork | undefined {
  if (value === 'mainnet' || value === 'testnet' || value === 'regtest') return value;
  return undefined;
}

/**
 * Every rejection carries a named reason so the claim UI can show specific
 * static copy instead of an opaque `invalid_xpub`. The server remains the
 * authoritative validator; these names only gate what leaves the browser.
 */
export type AccountXpubRejectionReason =
  | 'bitcoin_network_unconfigured'
  | 'not_base58check'
  | 'unexpected_length'
  | 'invalid_checksum'
  | 'unrecognized_version_bytes'
  | 'test_network_key_on_mainnet'
  | 'mainnet_key_on_test_network'
  | 'master_key'
  | 'non_account_depth'
  | 'unhardened_account_child'
  | 'invalid_public_key'
  | 'deny_listed_key';

export type NormalizedAccountXpub =
  | { ok: true; xpub: string; bytes: Uint8Array }
  | { ok: false; reason: AccountXpubRejectionReason };

/** BIP32 canonical and SLIP-132 BIP84 (P2WPKH) extended-key version bytes (big-endian). */
const VERSION_XPUB = 0x0488b21e;
const VERSION_ZPUB = 0x04b24746;
const VERSION_TPUB = 0x043587cf;
const VERSION_VPUB = 0x045f1cf6;

/** Serialized extended key: 78-byte payload + 4-byte base58check checksum. */
const EXTENDED_KEY_PAYLOAD_LENGTH = 78;
const BASE58CHECK_CHECKSUM_LENGTH = 4;

/** BIP32 hardened-derivation offset; an account child number sits above it. */
const HARDENED_OFFSET = 0x80000000;

/** Byte offsets inside the 78-byte extended-key serialization. */
const DEPTH_OFFSET = 4;
const CHILD_NUMBER_OFFSET = 9;
const PUBLIC_KEY_OFFSET = 45;

/**
 * A compressed secp256k1 public key is 33 bytes starting 0x02/0x03 AND must
 * decode to a point on the curve — a well-formed prefix over a garbage
 * x-coordinate is not a key (Terra P2).
 */
function isValidCompressedPublicKey(publicKey: Uint8Array): boolean {
  if (publicKey.length !== 33) return false;
  if (publicKey[0] !== 0x02 && publicKey[0] !== 0x03) return false;
  try {
    secp256k1.Point.fromBytes(publicKey);
    return true;
  } catch {
    return false;
  }
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_DIGITS = new Map([...BASE58_ALPHABET].map((char, index) => [char, BigInt(index)]));

function decodeBase58(value: string): Uint8Array | null {
  if (value.length === 0) return null;
  let num = BigInt(0);
  for (const char of value) {
    const digit = BASE58_DIGITS.get(char);
    if (digit === undefined) return null;
    num = num * BigInt(58) + digit;
  }
  const body: number[] = [];
  while (num > BigInt(0)) {
    body.unshift(Number(num & BigInt(0xff)));
    num >>= BigInt(8);
  }
  let leadingZeros = 0;
  for (const char of value) {
    if (char !== '1') break;
    leadingZeros++;
  }
  return Uint8Array.from([...new Array<number>(leadingZeros).fill(0), ...body]);
}

function encodeBase58(bytes: Uint8Array): string {
  let leadingZeros = 0;
  for (const byte of bytes) {
    if (byte !== 0) break;
    leadingZeros++;
  }
  let num = BigInt(0);
  for (const byte of bytes) num = (num << BigInt(8)) | BigInt(byte);
  let encoded = '';
  while (num > BigInt(0)) {
    encoded = BASE58_ALPHABET[Number(num % BigInt(58))] + encoded;
    num /= BigInt(58);
  }
  return '1'.repeat(leadingZeros) + encoded;
}

/** Base58check-encode a payload (double-SHA-256 checksum appended). */
export function encodeBase58Check(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).subarray(0, BASE58CHECK_CHECKSUM_LENGTH);
  const full = new Uint8Array(payload.length + BASE58CHECK_CHECKSUM_LENGTH);
  full.set(payload);
  full.set(checksum, payload.length);
  return encodeBase58(full);
}

/**
 * Known-public key material that must never be claimed: the first 20 BIP84
 * accounts (0–19) of the BIP39 `abandon … about` test mnemonic, at
 * m/84'/0'/n' (mainnet) and m/84'/1'/n' (test networks). Each entry is the
 * hex of the 65-byte tail of the canonical 78-byte serialization (32-byte
 * chain code + 33-byte public key), so the `xpub`/`zpub` (or `tpub`/`vpub`)
 * encodings of the same key are caught by one entry. `payment-methods.test.ts`
 * recomputes every entry from the mnemonic and asserts the published BIP84
 * test vectors against the derivation, so these constants cannot drift.
 */
export const DENY_LISTED_KEY_TAILS_HEX: readonly string[] = [
  '4a53a0ab21b9dc95869c4e92a161194e03c0ef3ff5014ac692f433c4765490fc02707a62fdacc26ea9b63b1c197906f56ee0180d0bcf1966e1a2da34f5f3a09a9b', // m/84'/0'/0'
  'cd432b179d8421cfdcd6f9747d465e158dec3263829cb445ed7ebd16a1c78768027570d308cd8e665dccd70342e81959c6a466a631e987b940569d5670e35f39cd', // m/84'/0'/1'
  'ed6669039cbe22a268667196b31dd1371318d7d5918c1fc5f47f96b86c06f607020c46a9fe29f9dc5e68ad2d89c9bae6a5a4ab09e27a05c1ea877504bdd27e236e', // m/84'/0'/2'
  'aebacd86fef96fc6913f72103ecc3b6fbaceb7600555130469e3ee798c243d1002f6ed90fe09a3c2effb8b19b9c65dea73e41264f5e402413792449ea6978524e1', // m/84'/0'/3'
  '2b5be312155ff5da675b60ef9ad6d22147ba096e99cacb2c8e59a47d756422b5020e4aefaf5e190aea8add342c4b0cb6c0be4959cf0fc5e5a5a8c75190022361b3', // m/84'/0'/4'
  '959ddf3b3b45a2494e4c78d1aabb07ce7db621bd59f7aa3d5e94a6dc93d6470d03d75104fae97639d555bb36e637ceaa54c2fb759ae543aef55af7a7da1184a7e3', // m/84'/0'/5'
  '2d92a3fd5f55cb444b135e673cdf0fb396d9a92c963d038589b20c68abba0728033c1485f564e19f6445e3a0a6448a1e932cf8758311ee64cfc69d4417e8c28a81', // m/84'/0'/6'
  'eb68c48af0587d10a9bd6873ee0806401e0a45183ba04a9eec60525a5fd2f972028093cfc4b16f1e25d8a00d3049a41fbfa7eca0b03ed87bfd7e9d396b65869e2e', // m/84'/0'/7'
  '38607a1e889b04f6ce7dca5e5a8bc5b71c5347da83d15dbf492521fe575311af020ace6a039cc141675b1ee72e8257a03f9858054022a1cf8179fff357a38d4fdf', // m/84'/0'/8'
  'd6d7ed81908965d88de7a6985cd32d4aa3aa8625359c16c723680795a4b57e6002d6b045e07a8ff972c23ce552a6789d9832f120cf037ce1c6c33a1dcb771a99c7', // m/84'/0'/9'
  '669721be74253f9333565fbe696df671aa5ad2fd459d2b6fd8e8f793ab1ed920033be9a90a8ad6c41b1fbfcbd33dd2b6a0d75c5367d00c3d638632d5ee23185996', // m/84'/0'/10'
  'c65c5a7784a086b63027dcaafd378d84c2f29076f0532e2731e407d5c1dab5ad029366aeaea9418c862da3f97265ceb3f55a8b0577a3e80b5c51cd4a86d33a647b', // m/84'/0'/11'
  '18dd5552514f98bef01f5e1ab77d46d023f0c8679fb6406398d47cc76292938a03b19f00da53995bdfcbd03cdf5c96ec6b8453a4558b9d91a286ac788987a65bea', // m/84'/0'/12'
  'db1251ff1792dee2457eee6bc814cfaf1b3a961d8d8f6ba273377ef2cfd008280234dae45311e2cb5537156fef447f19d917ca385802b42ff3f7badedd533bfe4f', // m/84'/0'/13'
  'f53f4664d3f946e3ffd000d4e3974edbc019dcdcc83a917841dbf0782bcb969802febb6234cf35a175b66c2d0e543d80ed41a2d3a18cc82d2d9b4e6b9f36ebc07e', // m/84'/0'/14'
  '37780129c6da76d44cee378ab051811f33ebd43aa502fb4bf49cde31b366ae8e0340277115d5c735aa86c4a2630b818e0c80fd91dd22a68f821ac8a8cb92ac4157', // m/84'/0'/15'
  'bff623f08ac13aff0c70a4efd1f17e4f5fd8648573f6d11c140f507f1fc933d20364c3cf93ce1c1a6fdf3f6ef6352e322d905710502cd4686f1eff00943851d17e', // m/84'/0'/16'
  '7693a55fb8605694763cb1bb158f92d74f48d1fed05b349769f6461ae8ad396303d17111e3090464248c926e979d4a68366b29dfef0107806c51a9555bb9933541', // m/84'/0'/17'
  '6af5a62015dd274be08d914f066acb6b7887449678feb275c134c66abc3ba2e1031bfe91dda584d3fdb85cbc170870241c8eceb42a8b25c480238c8744ab71b3d0', // m/84'/0'/18'
  '9466b682d2f10754d16e8909b83b679b2f1fd8b0b9dba6861c8600311a1fed2802ecd9b9aa8b018ee7ca97720827168d0ba8262653ba015373c162e0c328f82fe3', // m/84'/0'/19'
  '3c8c2037ee4c1621da0d348db51163709a622d0d2838dde6d8419c51f6301c6203b88e0fbe3f646337ed93bc0c0f3b843fcf7d2589e5ec884754e6402027a890b4', // m/84'/1'/0'
  'b77c83bbc286ab388fded611aa5adebb8d3932c44005ecda4295198b1598eaaf03ad1e393861a74d4cbf8e5ffb86fa0d91ae674b684aa031bd21a4437259f1d69d', // m/84'/1'/1'
  '25804c13a64f1ab3ceed8da8166f257ce41fb549b8072e230aee119bfc71684d02e5cc788976214fed63615b78d66dcc212773817e052b5d52f4a1ef8e7f505c5b', // m/84'/1'/2'
  '393a49849e7fdc11a3cc5d899459c0b94a8919d19ca2a747b10d61b8bf3a38ba03997631b77947167e6fce1db0a74981158b305a0675981850174c681e210089f7', // m/84'/1'/3'
  '63d4712dd177b6f6d713d05e6f186406713bb6126c4254725e94a8c86c31b30102da049bf51ddfeb4d3138985f2215f07ac48e5984e1bde825e556870ccc2e3b0d', // m/84'/1'/4'
  'b8557f70bb37558792116acb4eca9c884d97f12e6b5b93163fc93658ffc6763d036a1aae0049ae44d8066f6583f5f14a9a2e7cd2a580fb9b18300439a09660cd2f', // m/84'/1'/5'
  '08433acbe51b90a429e133a391c0196c65c1df5d7c3101ec9df49da968e373fc027a5b14a2668d491b71b191e2b7b9eb96f51f081f06f1d10c07164fe062df0613', // m/84'/1'/6'
  'a51f9495bd93b5c77224ca9731db01535e5355890cb46bdd48dca67a2441315402c897bbecfbe7e66856abbd7b32a45e0888e7ab88c4393d96c230982ea2aa2c47', // m/84'/1'/7'
  '07843fa9a33705bff3c6e9991cf1b4ad51822004d0c5bba4bd53cdf614ccd97503d1a8f2ab32277692bfda2ffeb9af719d7d52e4d9da40df2ba90002d85d38dca0', // m/84'/1'/8'
  '7cdfbf6ed1fd64f35dc0197d94419c354c80118ba5e120b492a15981b488956903db528b3a3ec42b3a2c67d78016f05933022193ae936507d844d05c37db13736c', // m/84'/1'/9'
  'd25ad4af81ddaf5f9577f082c333976c67038e0ab1674c2f1ae2c3f531f7198d0352b292231392201da3861e4004ffe41b1432de6f8545a080dde2988b8b8a716b', // m/84'/1'/10'
  'db7e9323ce1cd95ea84551ea900393ff104f06d8eb55f0d8d96622b88851449e03faf8028e6add6124c4427e7da3488032dc192c39f47d74e312dcdbfd5169bb0c', // m/84'/1'/11'
  '1280a08bf906901268849da7c76c50bd96a2e3e213d67993faec34908281dcea035dfd1020aa51fdc0ffdc9517a107a6a3577b82b79cba4446e0841808456496f4', // m/84'/1'/12'
  'c03c08a1aeb3fa6aac50e9fc93d317ac03b383c3326bf3d806a54aba8808ef6d0262407790e5dd91ebd98aaa42396ff0cad607c6acf2c18c76fa2b7f75ad56a2a0', // m/84'/1'/13'
  '068a7fccc5cb119e281c5bdcc32f60291ddb1767afa459d94681c2d524cb8ebb03447766007fbf3b7c1a7d4580d771a8dd5225a236fee7ad40c77102ae77a96b96', // m/84'/1'/14'
  'b805f5336f311f2de460a8fda9a448003735b4b4d429609a3b4168ebf983715d02e7881e073e8d21c433f7c7e24865c1aff38c26f7c75862196562c39f16d07f39', // m/84'/1'/15'
  'f6fc18d7b82586fa675f9228b484f11b5b39bfad628e1508abeeb5c7808d2b4d0283ba379725bea954fa0d57d74a143657bad1456c5a889ed933de646fae8953fa', // m/84'/1'/16'
  'c81c630fce6e1e90810eb5d38d687d6fa4f705509a7a89bb697a114e6f350a7102f3d3cbf18d58529ce54c51c658ab89e84ba15f2b54fbe37cd70a531a55f5b8d1', // m/84'/1'/17'
  'ceb32db3d975b94c892e3cf350da56cf7cfa9e78bd5c9cfede2bae8bc970d56402cde74dcd6128c332b752873d7527a4329f15012780b2180c4c5c67d86d027c16', // m/84'/1'/18'
  '1bd1d0b2c364acecb99cd362d4efc34f33a011b3a8774fb01b0216f4bedd3f32037ca5c86ed632a1f69af3d86c399822128c25032c577cbd4322f94db5be7db06a', // m/84'/1'/19'
];

const DENY_LISTED_KEY_TAILS = new Set(DENY_LISTED_KEY_TAILS_HEX);

/**
 * Validate a pasted BIP84 account extended key for the configured network and
 * return the canonical form the claim endpoint must receive.
 *
 * Order of checks (design §B.6): base58check decode, exact length, checksum,
 * exact version-byte recognition — and only then the SLIP-132 version-byte
 * rewrite (`zpub`→`xpub` on mainnet, `vpub`→`tpub` on test networks) and the
 * deny-list over the normalized 65-byte key tail. On success, `xpub` is the
 * normalized base58check string (what gets POSTed) and `bytes` the exact
 * 78 bytes the server stores.
 */
export function normalizeAccountXpub(pasted: string, network: BitcoinNetwork | undefined): NormalizedAccountXpub {
  if (!network) return { ok: false, reason: 'bitcoin_network_unconfigured' };

  const decoded = decodeBase58(pasted.trim());
  if (!decoded) return { ok: false, reason: 'not_base58check' };
  if (decoded.length !== EXTENDED_KEY_PAYLOAD_LENGTH + BASE58CHECK_CHECKSUM_LENGTH) {
    return { ok: false, reason: 'unexpected_length' };
  }
  const payload = decoded.subarray(0, EXTENDED_KEY_PAYLOAD_LENGTH);
  const expectedChecksum = sha256(sha256(payload)).subarray(0, BASE58CHECK_CHECKSUM_LENGTH);
  const actualChecksum = decoded.subarray(EXTENDED_KEY_PAYLOAD_LENGTH);
  if (bytesToHex(actualChecksum) !== bytesToHex(expectedChecksum)) return { ok: false, reason: 'invalid_checksum' };

  const version = new DataView(payload.buffer, payload.byteOffset).getUint32(0, false);
  const isMainnet = network === 'mainnet';
  const testNetworkVersions: readonly number[] = [VERSION_TPUB, VERSION_VPUB];
  const mainnetVersions: readonly number[] = [VERSION_XPUB, VERSION_ZPUB];
  if ((isMainnet ? testNetworkVersions : mainnetVersions).includes(version)) {
    return { ok: false, reason: isMainnet ? 'test_network_key_on_mainnet' : 'mainnet_key_on_test_network' };
  }
  const canonicalVersion = isMainnet ? VERSION_XPUB : VERSION_TPUB;
  const slip132Version = isMainnet ? VERSION_ZPUB : VERSION_VPUB;
  if (version !== canonicalVersion && version !== slip132Version) {
    return { ok: false, reason: 'unrecognized_version_bytes' };
  }

  // Structure of an account key (Terra P2): a checksum-valid serialization
  // with recognized version bytes is not yet an account key. A BIP84 account
  // xpub sits at depth 3 (m/84'/coin'/account') with a hardened child number,
  // and carries a valid compressed public key. The server enforces the same
  // on every claim; refusing here keeps malformed keys from leaving the
  // browser at all.
  const payloadView = new DataView(payload.buffer, payload.byteOffset);
  const depth = payload[DEPTH_OFFSET];
  if (depth === 0) return { ok: false, reason: 'master_key' };
  if (depth !== 3) return { ok: false, reason: 'non_account_depth' };
  if (payloadView.getUint32(CHILD_NUMBER_OFFSET, false) < HARDENED_OFFSET) {
    return { ok: false, reason: 'unhardened_account_child' };
  }
  if (!isValidCompressedPublicKey(payload.subarray(PUBLIC_KEY_OFFSET))) {
    return { ok: false, reason: 'invalid_public_key' };
  }

  // SLIP-132 rewrite: only the version bytes change; the 74 remaining bytes —
  // and therefore the key the server stores — are untouched.
  const normalized = new Uint8Array(payload);
  new DataView(normalized.buffer).setUint32(0, canonicalVersion, false);

  // Deny on the 65-byte tail (chain code + public key) so every encoding of a
  // known-public key is caught by one entry.
  if (DENY_LISTED_KEY_TAILS.has(bytesToHex(normalized.subarray(13)))) {
    return { ok: false, reason: 'deny_listed_key' };
  }

  return { ok: true, xpub: encodeBase58Check(normalized), bytes: normalized };
}
