import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  BIP84_VERSION_BYTES,
  type Bip84CoinType,
  deriveBip84Account,
  deriveBip84FirstAddress,
} from '@/test-utils/bip84';
import {
  availablePaymentMethods,
  DENY_LISTED_KEY_TAILS_HEX,
  encodeBase58Check,
  isStripePaymentLink,
  isStripeRestrictedKey,
  normalizeAccountXpub,
  parseBitcoinNetwork,
} from './payment-methods';

/** The BIP39 test mnemonic the published BIP84 test vectors are derived from. */
const BIP84_TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** A second, unrelated public BIP39 vector mnemonic — none of its keys are deny-listed. */
const OTHER_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

/** Published BIP84 test vector, account 0 (BIP84 specification). */
const PUBLISHED_ACCOUNT0_ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const PUBLISHED_ACCOUNT0_FIRST_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

/** Re-encode a derived account payload under a different version-byte prefix. */
function encodeWithVersion(payload: Uint8Array, version: number): string {
  const rewritten = new Uint8Array(payload);
  new DataView(rewritten.buffer).setUint32(0, version, false);
  return encodeBase58Check(rewritten);
}

function accountEncodings(coinType: Bip84CoinType, accountIndex: number) {
  const account = deriveBip84Account(BIP84_TEST_MNEMONIC, coinType, accountIndex);
  return coinType === 0
    ? {
        canonical: encodeWithVersion(account.payload, BIP84_VERSION_BYTES.xpub),
        slip132: encodeWithVersion(account.payload, BIP84_VERSION_BYTES.zpub),
      }
    : {
        canonical: encodeWithVersion(account.payload, BIP84_VERSION_BYTES.tpub),
        slip132: encodeWithVersion(account.payload, BIP84_VERSION_BYTES.vpub),
      };
}

function otherAccountEncodings(coinType: Bip84CoinType, accountIndex: number) {
  const account = deriveBip84Account(OTHER_MNEMONIC, coinType, accountIndex);
  return coinType === 0
    ? {
        canonical: encodeWithVersion(account.payload, BIP84_VERSION_BYTES.xpub),
        slip132: encodeWithVersion(account.payload, BIP84_VERSION_BYTES.zpub),
      }
    : {
        canonical: encodeWithVersion(account.payload, BIP84_VERSION_BYTES.tpub),
        slip132: encodeWithVersion(account.payload, BIP84_VERSION_BYTES.vpub),
      };
}

describe('payment-methods', () => {
  describe('availablePaymentMethods', () => {
    it('renders methods in bitcoin, stripe, paypal order and only when configured', () => {
      expect(
        availablePaymentMethods({
          bitcoinAvailable: true,
          stripePaymentLink: 'https://buy.stripe.com/test_abc',
          paypalMerchantEmail: 'seller@example.com',
        }),
      ).toEqual(['bitcoin', 'stripe', 'paypal']);
      expect(
        availablePaymentMethods({ bitcoinAvailable: false, stripePaymentLink: null, paypalMerchantEmail: null }),
      ).toEqual([]);
      expect(
        availablePaymentMethods({
          bitcoinAvailable: false,
          stripePaymentLink: null,
          paypalMerchantEmail: 'seller@example.com',
        }),
      ).toEqual(['paypal']);
    });
  });

  describe('isStripePaymentLink', () => {
    it('accepts only https links on Stripe-hosted payment link hosts', () => {
      expect(isStripePaymentLink('https://buy.stripe.com/test_abc123')).toBe(true);
      expect(isStripePaymentLink('https://book.stripe.com/abc123')).toBe(true);
      expect(isStripePaymentLink('http://buy.stripe.com/test_abc123')).toBe(false);
      expect(isStripePaymentLink('https://evil.example.com/buy.stripe.com')).toBe(false);
      expect(isStripePaymentLink('https://stripe.com/payments')).toBe(false);
      expect(isStripePaymentLink('not a url')).toBe(false);
    });
  });

  describe('isStripeRestrictedKey', () => {
    it('accepts rk_ keys and refuses secret sk_ keys so they never leave the browser', () => {
      expect(isStripeRestrictedKey('rk_test_51NzXAbCdEfGh')).toBe(true);
      expect(isStripeRestrictedKey('rk_live_51NzXAbCdEfGh')).toBe(true);
      expect(isStripeRestrictedKey(' rk_test_51NzXAbCdEfGh ')).toBe(true);
      expect(isStripeRestrictedKey('sk_test_51NzXAbCdEfGh')).toBe(false);
      expect(isStripeRestrictedKey('pk_test_51NzXAbCdEfGh')).toBe(false);
      expect(isStripeRestrictedKey('rk_test_')).toBe(false);
      expect(isStripeRestrictedKey('')).toBe(false);
    });
  });

  describe('parseBitcoinNetwork', () => {
    it('accepts exactly the three configured network names', () => {
      expect(parseBitcoinNetwork('mainnet')).toBe('mainnet');
      expect(parseBitcoinNetwork('testnet')).toBe('testnet');
      expect(parseBitcoinNetwork('regtest')).toBe('regtest');
    });

    it('treats unset and unrecognised values as unconfigured — the client never guesses', () => {
      expect(parseBitcoinNetwork(undefined)).toBeUndefined();
      expect(parseBitcoinNetwork('')).toBeUndefined();
      expect(parseBitcoinNetwork('MAINNET')).toBeUndefined();
      expect(parseBitcoinNetwork('signet')).toBeUndefined();
      expect(parseBitcoinNetwork('mainnet2')).toBeUndefined();
    });
  });

  describe('normalizeAccountXpub', () => {
    it('refuses the claim when the Bitcoin network is unset or unrecognised', () => {
      const { canonical } = otherAccountEncodings(0, 0);
      expect(normalizeAccountXpub(canonical, undefined)).toEqual({ ok: false, reason: 'bitcoin_network_unconfigured' });
      expect(normalizeAccountXpub(canonical, parseBitcoinNetwork('signet'))).toEqual({
        ok: false,
        reason: 'bitcoin_network_unconfigured',
      });
    });

    it('normalizes zpub to the same 78 bytes and xpub string as the xpub form', () => {
      const { canonical, slip132 } = otherAccountEncodings(0, 0);
      const fromXpub = normalizeAccountXpub(canonical, 'mainnet');
      const fromZpub = normalizeAccountXpub(slip132, 'mainnet');
      expect(fromXpub.ok).toBe(true);
      expect(fromZpub.ok).toBe(true);
      if (!fromXpub.ok || !fromZpub.ok) return;
      expect(fromZpub.bytes).toEqual(fromXpub.bytes);
      expect(fromZpub.bytes).toHaveLength(78);
      // The normalized string — what gets POSTed — is the canonical xpub form.
      expect(fromZpub.xpub).toBe(canonical);
      expect(fromXpub.xpub).toBe(canonical);
    });

    it('normalizes vpub to the same 78 bytes and tpub string as the tpub form on test networks', () => {
      const { canonical, slip132 } = otherAccountEncodings(1, 0);
      for (const network of ['testnet', 'regtest'] as const) {
        const fromTpub = normalizeAccountXpub(canonical, network);
        const fromVpub = normalizeAccountXpub(slip132, network);
        expect(fromTpub.ok).toBe(true);
        expect(fromVpub.ok).toBe(true);
        if (!fromTpub.ok || !fromVpub.ok) return;
        expect(fromVpub.bytes).toEqual(fromTpub.bytes);
        expect(fromVpub.xpub).toBe(canonical);
      }
    });

    it('rejects vpub and tpub on mainnet with a named reason', () => {
      const { canonical, slip132 } = otherAccountEncodings(1, 0);
      expect(normalizeAccountXpub(canonical, 'mainnet')).toEqual({ ok: false, reason: 'test_network_key_on_mainnet' });
      expect(normalizeAccountXpub(slip132, 'mainnet')).toEqual({ ok: false, reason: 'test_network_key_on_mainnet' });
    });

    it('rejects xpub and zpub on regtest and testnet with a named reason', () => {
      const { canonical, slip132 } = otherAccountEncodings(0, 0);
      for (const network of ['testnet', 'regtest'] as const) {
        expect(normalizeAccountXpub(canonical, network)).toEqual({
          ok: false,
          reason: 'mainnet_key_on_test_network',
        });
        expect(normalizeAccountXpub(slip132, network)).toEqual({
          ok: false,
          reason: 'mainnet_key_on_test_network',
        });
      }
    });

    it('rejects malformed input with named reasons, never an opaque invalid_xpub', () => {
      const { canonical } = otherAccountEncodings(0, 0);
      // Non-base58 content ('0', 'O', 'I', 'l' are outside the base58 alphabet).
      expect(normalizeAccountXpub(`${canonical}0`, 'mainnet')).toEqual({ ok: false, reason: 'not_base58check' });
      expect(normalizeAccountXpub('npub1abcdef0', 'mainnet')).toEqual({ ok: false, reason: 'not_base58check' });
      // A well-formed base58check payload of the wrong length (a 20-byte hash, not a key).
      expect(normalizeAccountXpub(encodeBase58Check(new Uint8Array(20)), 'mainnet')).toEqual({
        ok: false,
        reason: 'unexpected_length',
      });
      // A single altered character breaks the base58check checksum.
      const corrupted = `${canonical.slice(0, -1)}${canonical.endsWith('x') ? 'y' : 'x'}`;
      expect(normalizeAccountXpub(corrupted, 'mainnet')).toEqual({ ok: false, reason: 'invalid_checksum' });
      // Exact version-byte recognition: ypub (BIP49) is not a BIP84 account key.
      const account = deriveBip84Account(OTHER_MNEMONIC, 0, 0);
      const ypub = encodeWithVersion(account.payload, 0x049d7cb2);
      expect(normalizeAccountXpub(ypub, 'mainnet')).toEqual({ ok: false, reason: 'unrecognized_version_bytes' });
    });

    it('tolerates surrounding whitespace around the pasted key', () => {
      const { canonical } = otherAccountEncodings(0, 0);
      expect(normalizeAccountXpub(`  ${canonical}\n`, 'mainnet').ok).toBe(true);
    });
  });

  describe('deny-list (known public test-vector keys)', () => {
    it('rejects the published BIP84 test-vector key in both xpub and zpub encodings', () => {
      const { canonical, slip132 } = accountEncodings(0, 0);
      expect(slip132).toBe(PUBLISHED_ACCOUNT0_ZPUB);
      expect(normalizeAccountXpub(canonical, 'mainnet')).toEqual({ ok: false, reason: 'deny_listed_key' });
      expect(normalizeAccountXpub(slip132, 'mainnet')).toEqual({ ok: false, reason: 'deny_listed_key' });
    });

    it('rejects accounts 0-19 of the test mnemonic in both encodings on mainnet', () => {
      for (let accountIndex = 0; accountIndex < 20; accountIndex++) {
        const { canonical, slip132 } = accountEncodings(0, accountIndex);
        expect(normalizeAccountXpub(canonical, 'mainnet')).toEqual({ ok: false, reason: 'deny_listed_key' });
        expect(normalizeAccountXpub(slip132, 'mainnet')).toEqual({ ok: false, reason: 'deny_listed_key' });
      }
    });

    it('rejects accounts 0-19 of the test mnemonic in both encodings on test networks', () => {
      for (let accountIndex = 0; accountIndex < 20; accountIndex++) {
        const { canonical, slip132 } = accountEncodings(1, accountIndex);
        for (const network of ['testnet', 'regtest'] as const) {
          expect(normalizeAccountXpub(canonical, network)).toEqual({ ok: false, reason: 'deny_listed_key' });
          expect(normalizeAccountXpub(slip132, network)).toEqual({ ok: false, reason: 'deny_listed_key' });
        }
      }
    });

    it('does not deny unrelated account keys', () => {
      expect(normalizeAccountXpub(otherAccountEncodings(0, 0).canonical, 'mainnet').ok).toBe(true);
      expect(normalizeAccountXpub(otherAccountEncodings(0, 3).slip132, 'mainnet').ok).toBe(true);
      expect(normalizeAccountXpub(otherAccountEncodings(1, 0).canonical, 'regtest').ok).toBe(true);
    });

    it('recomputes every committed deny-list tail from the mnemonic', () => {
      const recomputed = new Set<string>();
      for (const coinType of [0, 1] as const) {
        for (let accountIndex = 0; accountIndex < 20; accountIndex++) {
          const account = deriveBip84Account(BIP84_TEST_MNEMONIC, coinType, accountIndex);
          // The deny key is the 65-byte tail: 32-byte chain code + 33-byte public key.
          recomputed.add(bytesToHex(account.payload.subarray(13)));
        }
      }
      expect(recomputed.size).toBe(40);
      expect(new Set(DENY_LISTED_KEY_TAILS_HEX)).toEqual(recomputed);
    });
  });

  describe('published BIP84 test vectors (asserted directly)', () => {
    it('derives the literal published account-0 zpub from the test mnemonic', () => {
      const account = deriveBip84Account(BIP84_TEST_MNEMONIC, 0, 0);
      expect(encodeWithVersion(account.payload, BIP84_VERSION_BYTES.zpub)).toBe(PUBLISHED_ACCOUNT0_ZPUB);
    });

    it('derives the published account-0 first receiving address', () => {
      const account = deriveBip84Account(BIP84_TEST_MNEMONIC, 0, 0);
      expect(deriveBip84FirstAddress(account, 'bc')).toBe(PUBLISHED_ACCOUNT0_FIRST_ADDRESS);
    });
  });
});
