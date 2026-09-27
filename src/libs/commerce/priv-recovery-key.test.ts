import { describe, expect, it } from 'vitest';
import { base64UrlToBytes, decryptPrivRecord, encryptPrivRecord, type PrivKeyring } from './priv-envelope';
import { buildPrivRecoveryKeyFile, PRIV_RECOVERY_KEY_FORMAT } from './priv-recovery-key';

const OWNER = 'k'.repeat(52);
const KEYRING: PrivKeyring = {
  ownerPubky: OWNER,
  currentKeyId: 'b'.repeat(32),
  keys: [
    { keyId: 'a'.repeat(32), key: new Uint8Array(32).fill(1) },
    { keyId: 'b'.repeat(32), key: new Uint8Array(32).fill(2) },
  ],
};

describe('buildPrivRecoveryKeyFile', () => {
  it('carries every key, oldest first, with the owner and the envelope format', () => {
    const file = buildPrivRecoveryKeyFile(KEYRING);
    const document = JSON.parse(file.contents);

    expect(file.fileName).toBe(`pubky-marketplace-recovery-key-${OWNER.slice(0, 8)}.json`);
    expect(document).toEqual({
      format: PRIV_RECOVERY_KEY_FORMAT,
      enc: 'pubky-priv-aead/v1',
      owner: OWNER,
      currentKeyId: 'b'.repeat(32),
      keys: [
        { keyId: 'a'.repeat(32), key: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE' },
        { keyId: 'b'.repeat(32), key: 'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI' },
      ],
    });
  });

  it('opens records sealed under any exported key', () => {
    const sealedOld = encryptPrivRecord({
      keyring: { ...KEYRING, currentKeyId: 'a'.repeat(32) },
      family: 'watchlist',
      id: 'watchlist',
      record: { v: 1 },
    });
    const document = JSON.parse(buildPrivRecoveryKeyFile(KEYRING).contents) as {
      owner: string;
      currentKeyId: string;
      keys: { keyId: string; key: string }[];
    };
    const restored: PrivKeyring = {
      ownerPubky: document.owner,
      currentKeyId: document.currentKeyId,
      keys: document.keys.map(({ keyId, key }) => ({ keyId, key: base64UrlToBytes(key) })),
    };
    expect(decryptPrivRecord({ keyring: restored, family: 'watchlist', id: 'watchlist', envelope: sealedOld })).toEqual(
      {
        v: 1,
      },
    );
  });
});
