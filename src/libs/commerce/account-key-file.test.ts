import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BIP84_VERSION_BYTES, deriveBip84Account } from '@/test-utils/bip84';
import {
  ACCOUNT_KEY_FILE_MAX_BYTES,
  descriptorChecksum,
  looksLikePrivateKeyMaterial,
  parseAccountKeyFile,
} from './account-key-file';
import { encodeBase58Check } from './payment-methods';

/** A second, unrelated public BIP39 vector mnemonic — none of its keys are deny-listed. */
const OTHER_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

const DERIVED_ACCOUNT = deriveBip84Account(OTHER_MNEMONIC, 0, 0);

function fixture(name: string): string {
  return readFileSync(resolve(__dirname, '../../test/fixtures/commerce/account-keys', name), 'utf8');
}

describe('account-key-file', () => {
  describe('descriptorChecksum (BIP380)', () => {
    it('matches the published Bitcoin Core checksum vectors', () => {
      expect(
        descriptorChecksum(
          'rawtr([5a61ff8e/86h/1h/0h]xpub6DtZpc9PRL2B6pwoNGysmHAaBofDmWv5S6KQEKKGPKhf5fV62ywDtSziSApYVK3JnYY5KUSgiCwiXW5wtd8z7LNBxT9Mu5sEro8itdGfTeA/1/*)',
        ),
      ).toBe('vwgx7hj9');
      expect(
        descriptorChecksum(
          "sh(multi(2,[00000000/111'/222]xpub6ERApfZwUNrhLCkDtcHTcxd75RbzS1ed54G1LkBUHQVHQKqhMkhgbmJbZRkrgZw4koxb5JaHWkY4ALHY2grBGRjaDMzQLcgJvLJuZZvRcEL,xpub68NZiKmJWnxxS6aaHmn81bvJeTESw724CRDs6HbuccFQN9Ku14VQrADWgqbhhTHBaohPX4CjNLf9fq9MYo6oDaPPLPxSb7gwQN3ih19Zm4Y/0))",
        ),
      ).toBe('tjg09x5t');
    });
  });

  describe('accepted artifacts reduce to the same normalized 78 bytes', () => {
    it('keeps the committed fixtures in sync with the test-vector derivation', () => {
      // The fixtures embed derived public material; recompute it so the files
      // cannot drift from the published BIP39 vector they came from.
      expect(fixture('bip84-account-xpub.txt').trim()).toBe(encodeBase58Check(DERIVED_ACCOUNT.payload));
      const zpubPayload = new Uint8Array(DERIVED_ACCOUNT.payload);
      new DataView(zpubPayload.buffer).setUint32(0, BIP84_VERSION_BYTES.zpub, false);
      expect(fixture('bip84-account-zpub.txt').trim()).toBe(encodeBase58Check(zpubPayload));
    });

    it('accepts a plain-text file with exactly one key (xpub and zpub forms)', () => {
      for (const name of ['bip84-account-xpub.txt', 'bip84-account-zpub.txt']) {
        const result = parseAccountKeyFile(fixture(name), 'mainnet');
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.bytes).toEqual(DERIVED_ACCOUNT.payload);
        expect(result.xpub).toBe(encodeBase58Check(DERIVED_ACCOUNT.payload));
      }
    });

    it('accepts a single-sig wpkh descriptor with a verified checksum', () => {
      const result = parseAccountKeyFile(fixture('wpkh-descriptor.txt'), 'mainnet');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.bytes).toEqual(DERIVED_ACCOUNT.payload);
    });

    it('accepts a Coldcard-style generic JSON export and ignores other script types', () => {
      const result = parseAccountKeyFile(fixture('coldcard-export.json'), 'mainnet');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.bytes).toEqual(DERIVED_ACCOUNT.payload);
    });
  });

  describe('refused artifacts, each with a named reason', () => {
    it('refuses a file over the size cap', () => {
      const oversized = `x${'1'.repeat(ACCOUNT_KEY_FILE_MAX_BYTES)}`;
      expect(parseAccountKeyFile(oversized, 'mainnet')).toEqual({ ok: false, reason: 'file_too_large' });
    });

    it('refuses an extended private key file loudly', () => {
      expect(parseAccountKeyFile(fixture('xprv-backup.txt'), 'mainnet')).toEqual({
        ok: false,
        reason: 'private_key_material',
      });
    });

    it('refuses a 12-word mnemonic file loudly', () => {
      expect(parseAccountKeyFile(fixture('mnemonic.txt'), 'mainnet')).toEqual({
        ok: false,
        reason: 'private_key_material',
      });
    });

    it('refuses a descriptor carrying a private key', () => {
      const descriptor =
        'wpkh([ea517ee5/84h/0h/0h]xprv9s21ZrQH143K3GJpoapnV8SFfukcVBSfeCficPSGfubmSFDxo1kuHnLisriDvSnRRuL2Qrg5ggqHKNVpxR86QEC8w35uxmGoggxtQTPvfUu/0/*)';
      expect(parseAccountKeyFile(descriptor, 'mainnet')).toEqual({ ok: false, reason: 'private_key_material' });
      expect(looksLikePrivateKeyMaterial(descriptor)).toBe(true);
    });

    it('refuses pkh, multisig, and tr descriptors as unsupported_script_type', () => {
      for (const name of ['pkh-descriptor.txt', 'multi-descriptor.txt', 'tr-descriptor.txt']) {
        expect(parseAccountKeyFile(fixture(name), 'mainnet')).toEqual({
          ok: false,
          reason: 'unsupported_script_type',
        });
      }
    });

    it('refuses a wpkh descriptor with a non-/0/* range', () => {
      expect(parseAccountKeyFile(fixture('wpkh-descriptor-change-range.txt'), 'mainnet')).toEqual({
        ok: false,
        reason: 'unsupported_derivation_range',
      });
    });

    it('refuses a descriptor whose origin account disagrees with the key', () => {
      expect(parseAccountKeyFile(fixture('wpkh-descriptor-account-mismatch.txt'), 'mainnet')).toEqual({
        ok: false,
        reason: 'descriptor_account_mismatch',
      });
    });

    it('refuses a descriptor with a broken checksum', () => {
      const good = fixture('wpkh-descriptor.txt').trim();
      const checksum = good.slice(-8);
      const flipped = checksum.startsWith('q') ? `p${checksum.slice(1)}` : `q${checksum.slice(1)}`;
      expect(parseAccountKeyFile(`${good.slice(0, -8)}${flipped}`, 'mainnet')).toEqual({
        ok: false,
        reason: 'unrecognized_file',
      });
    });

    it('refuses malformed JSON and JSON without a bip84 account', () => {
      expect(parseAccountKeyFile(fixture('malformed.json'), 'mainnet')).toEqual({
        ok: false,
        reason: 'unrecognized_file',
      });
      expect(parseAccountKeyFile('{"chain":"BTC","xpub":"ignored"}', 'mainnet')).toEqual({
        ok: false,
        reason: 'unrecognized_file',
      });
    });

    it('refuses a generic JSON whose bip84.deriv disagrees with the key', () => {
      const parsed = JSON.parse(fixture('coldcard-export.json')) as { bip84: { deriv: string } };
      parsed.bip84.deriv = "m/84'/0'/7'";
      expect(parseAccountKeyFile(JSON.stringify(parsed), 'mainnet')).toEqual({
        ok: false,
        reason: 'descriptor_account_mismatch',
      });
    });

    it('refuses a text file holding more than one key', () => {
      const two = `${fixture('bip84-account-xpub.txt').trim()}\n${fixture('bip84-account-zpub.txt').trim()}`;
      expect(parseAccountKeyFile(two, 'mainnet')).toEqual({ ok: false, reason: 'unrecognized_file' });
    });

    it('passes the validator reasons through: wrong network and deny-listed keys', () => {
      expect(parseAccountKeyFile(fixture('bip84-account-xpub.txt'), 'testnet')).toEqual({
        ok: false,
        reason: 'mainnet_key_on_test_network',
      });
      // The published BIP84 account-0 zpub is publicly known key material.
      expect(
        parseAccountKeyFile(
          'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs',
          'mainnet',
        ),
      ).toEqual({ ok: false, reason: 'deny_listed_key' });
      expect(parseAccountKeyFile(fixture('wpkh-descriptor.txt'), undefined)).toEqual({
        ok: false,
        reason: 'bitcoin_network_unconfigured',
      });
    });
  });
});
