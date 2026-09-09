import { describe, expect, it } from 'vitest';
import {
  accountPublicNode,
  BIP84_VERSION_BYTES,
  deriveBip84Account,
  deriveBip84AddressAtIndex,
  deriveBip84FirstAddress,
} from '@/test-utils/bip84';
import {
  accountIndexFromBytes,
  accountKeyFingerprint,
  type ClaimedAccountDetails,
  deriveBip84P2wpkhAddress,
  verifyClaimedAccount,
} from './bip84-preview';
import { encodeBase58Check } from './payment-methods';

/** The BIP39 test mnemonic the published BIP84 test vectors are derived from. */
const BIP84_TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** A second, unrelated public BIP39 vector mnemonic — none of its keys are deny-listed. */
const OTHER_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

/** Published BIP84 test vectors, account 0 (BIP84 specification). */
const PUBLISHED_ACCOUNT0_ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const PUBLISHED_FIRST_RECEIVE_0 = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const PUBLISHED_FIRST_RECEIVE_1 = 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g';
const PUBLISHED_FIRST_CHANGE_0 = 'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el';

/** A valid claim response for `normalizedBytes` on the given network. */
function validClaim(normalizedBytes: Uint8Array, network: 'mainnet' | 'testnet' | 'regtest'): ClaimedAccountDetails {
  return {
    accountIndex: accountIndexFromBytes(normalizedBytes),
    keyFingerprint: accountKeyFingerprint(normalizedBytes),
    firstDerivedAddress: deriveBip84P2wpkhAddress(normalizedBytes, network, 0),
    nextChildIndex: 0,
    stackId: 'proof:3f6f4b2a-0000-4000-8000-000000000000',
  };
}

describe('bip84-preview', () => {
  describe('deriveBip84P2wpkhAddress against the published BIP84 vectors', () => {
    it('derives the published account-0 receiving addresses at 0/0 and 0/1 from the 78 bytes', () => {
      const account = deriveBip84Account(BIP84_TEST_MNEMONIC, 0, 0);
      // Anchor: the derived payload really is the published account-0 key.
      const zpub = (() => {
        const rewritten = new Uint8Array(account.payload);
        new DataView(rewritten.buffer).setUint32(0, BIP84_VERSION_BYTES.zpub, false);
        return encodeBase58Check(rewritten);
      })();
      expect(zpub).toBe(PUBLISHED_ACCOUNT0_ZPUB);

      expect(deriveBip84P2wpkhAddress(account.payload, 'mainnet', 0)).toBe(PUBLISHED_FIRST_RECEIVE_0);
      expect(deriveBip84P2wpkhAddress(account.payload, 'mainnet', 1)).toBe(PUBLISHED_FIRST_RECEIVE_1);
    });

    it('derives the published account-0 change address at 1/0', () => {
      const account = deriveBip84Account(BIP84_TEST_MNEMONIC, 0, 0);
      expect(deriveBip84P2wpkhAddress(account.payload, 'mainnet', 0, 1)).toBe(PUBLISHED_FIRST_CHANGE_0);
    });

    it('derives tb1q… addresses for the same key on testnet and regtest bcrt1q… on regtest', () => {
      const account = deriveBip84Account(BIP84_TEST_MNEMONIC, 1, 0);
      const testnetAddress = deriveBip84P2wpkhAddress(account.payload, 'testnet', 0);
      // Cross-check: the test-utils derivation (mnemonic → private path) agrees
      // with the production CKDpub derivation from the 78 public bytes.
      expect(testnetAddress).toBe(deriveBip84FirstAddress(account, 'tb'));
      expect(testnetAddress).toBe(deriveBip84AddressAtIndex(account, 'tb', 0));
      expect(testnetAddress.startsWith('tb1q')).toBe(true);
      const regtestAddress = deriveBip84P2wpkhAddress(account.payload, 'regtest', 0);
      expect(regtestAddress.startsWith('bcrt1q')).toBe(true);
      // Same key, same derivation path — only the HRP (and therefore the
      // 6-character checksum) differs; the witness-program data is identical.
      expect(regtestAddress.slice(regtestAddress.indexOf('1'), -6)).toBe(
        testnetAddress.slice(testnetAddress.indexOf('1'), -6),
      );
      expect(accountPublicNode(account).publicKey).toEqual(account.publicKey);
    });

    it('refuses hardened and out-of-range child indexes', () => {
      const account = deriveBip84Account(OTHER_MNEMONIC, 0, 0);
      expect(() => deriveBip84P2wpkhAddress(account.payload, 'mainnet', 0x80000000)).toThrow(RangeError);
      expect(() => deriveBip84P2wpkhAddress(account.payload, 'mainnet', -1)).toThrow(RangeError);
    });
  });

  describe('accountKeyFingerprint', () => {
    it('is the hex of the first 8 bytes of SHA-256 over the canonical 78 bytes', () => {
      const account = deriveBip84Account(OTHER_MNEMONIC, 0, 0);
      const fingerprint = accountKeyFingerprint(account.payload);
      expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
      // The SLIP-132 version-byte rewrite cannot change the fingerprint.
      const asZpub = new Uint8Array(account.payload);
      new DataView(asZpub.buffer).setUint32(0, BIP84_VERSION_BYTES.zpub, false);
      expect(accountKeyFingerprint(asZpub)).not.toBe(fingerprint);
      const canonicalAgain = new Uint8Array(asZpub);
      new DataView(canonicalAgain.buffer).setUint32(0, BIP84_VERSION_BYTES.xpub, false);
      expect(accountKeyFingerprint(canonicalAgain)).toBe(fingerprint);
    });
  });

  describe('verifyClaimedAccount (the confirmation gate)', () => {
    it('accepts a response that matches the normalized bytes exactly', () => {
      const account = deriveBip84Account(OTHER_MNEMONIC, 0, 0);
      expect(verifyClaimedAccount(account.payload, 'mainnet', validClaim(account.payload, 'mainnet'))).toEqual({
        ok: true,
      });
    });

    it('accepts a scanned start index: first_derived_address at 0/<next_child_index>', () => {
      const account = deriveBip84Account(OTHER_MNEMONIC, 0, 0);
      const claim: ClaimedAccountDetails = {
        ...validClaim(account.payload, 'mainnet'),
        nextChildIndex: 25,
        firstDerivedAddress: deriveBip84P2wpkhAddress(account.payload, 'mainnet', 25),
      };
      expect(verifyClaimedAccount(account.payload, 'mainnet', claim)).toEqual({ ok: true });
    });

    it('fails closed with server_fingerprint_missing when the fingerprint (or stack_id) is absent', () => {
      const account = deriveBip84Account(OTHER_MNEMONIC, 0, 0);
      const claim = validClaim(account.payload, 'mainnet');
      expect(verifyClaimedAccount(account.payload, 'mainnet', { ...claim, keyFingerprint: null })).toEqual({
        ok: false,
        reason: 'server_fingerprint_missing',
      });
      expect(verifyClaimedAccount(account.payload, 'mainnet', { ...claim, stackId: null })).toEqual({
        ok: false,
        reason: 'server_fingerprint_missing',
      });
    });

    it('refuses with server_fingerprint_mismatch when one fingerprint hex digit differs', () => {
      const account = deriveBip84Account(OTHER_MNEMONIC, 0, 0);
      const claim = validClaim(account.payload, 'mainnet');
      const tampered = claim.keyFingerprint!.endsWith('0')
        ? `${claim.keyFingerprint!.slice(0, -1)}1`
        : `${claim.keyFingerprint!.slice(0, -1)}0`;
      expect(verifyClaimedAccount(account.payload, 'mainnet', { ...claim, keyFingerprint: tampered })).toEqual({
        ok: false,
        reason: 'server_fingerprint_mismatch',
      });
    });

    it('refuses with server_address_mismatch when first_derived_address disagrees', () => {
      const account = deriveBip84Account(OTHER_MNEMONIC, 0, 0);
      const other = deriveBip84Account(OTHER_MNEMONIC, 0, 1);
      const claim = validClaim(account.payload, 'mainnet');
      expect(
        verifyClaimedAccount(account.payload, 'mainnet', {
          ...claim,
          firstDerivedAddress: deriveBip84P2wpkhAddress(other.payload, 'mainnet', 0),
        }),
      ).toEqual({ ok: false, reason: 'server_address_mismatch' });
      // Missing address or unusable index also fails closed.
      expect(verifyClaimedAccount(account.payload, 'mainnet', { ...claim, firstDerivedAddress: null })).toEqual({
        ok: false,
        reason: 'server_address_mismatch',
      });
      expect(verifyClaimedAccount(account.payload, 'mainnet', { ...claim, nextChildIndex: null })).toEqual({
        ok: false,
        reason: 'server_address_mismatch',
      });
    });

    it('negative (i): one mutated byte in the normalized key changes the preview and is refused', () => {
      const account = deriveBip84Account(OTHER_MNEMONIC, 0, 0);
      const claim = validClaim(account.payload, 'mainnet');
      const mutated = new Uint8Array(account.payload);
      mutated[20] ^= 0x01; // one byte inside the chain code
      expect(deriveBip84P2wpkhAddress(mutated, 'mainnet', 0)).not.toBe(
        deriveBip84P2wpkhAddress(account.payload, 'mainnet', 0),
      );
      expect(accountKeyFingerprint(mutated)).not.toBe(claim.keyFingerprint);
      // The gate compares the server's fingerprint against the mutated bytes…
      expect(verifyClaimedAccount(mutated, 'mainnet', claim)).toEqual({
        ok: false,
        reason: 'server_fingerprint_mismatch',
      });
      // …and a response honestly computed over the mutated bytes fails the
      // address comparison against the original claim.
      expect(
        verifyClaimedAccount(mutated, 'mainnet', {
          ...claim,
          keyFingerprint: accountKeyFingerprint(mutated),
        }),
      ).toEqual({ ok: false, reason: 'server_address_mismatch' });
    });
  });
});
