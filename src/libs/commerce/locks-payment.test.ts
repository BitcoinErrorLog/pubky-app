import { describe, expect, it } from 'vitest';
import {
  buyerVisiblePaymentStatus,
  encodeCrockfordBase32,
  generateLocksBundleId,
  lockPolicyCreator,
  toBareLockResource,
} from './locks-payment';
import { locksBareLockResourceSchema, locksBundleIdSchema } from './transaction-commands';

const CREATOR = 'y'.repeat(52);
const LOCK_ID = '000G40R40M30E209185GR38E1W8124GK2GAHC5RR34D1P70X3RFG';

describe('encodeCrockfordBase32', () => {
  it('encodes 16 bytes to 26 canonical characters', () => {
    expect(encodeCrockfordBase32(new Uint8Array(16))).toBe('0'.repeat(26));
    // 0xFF...: 128 one-bits -> 25 full groups of 5 plus 3 bits padded with zeros.
    expect(encodeCrockfordBase32(new Uint8Array(16).fill(0xff))).toBe(`${'Z'.repeat(25)}W`);
  });

  it('matches the known Crockford encoding of a byte sequence', () => {
    // 0x00 0x44 0x32 0x14 -> 00000 00001 00010 00011 00100 00101 00(000) -> "0123450"
    expect(encodeCrockfordBase32(new Uint8Array([0x00, 0x44, 0x32, 0x14]))).toBe('0123450');
  });
});

describe('generateLocksBundleId', () => {
  it('produces canonical bundle ids the command contract accepts', () => {
    for (let run = 0; run < 32; run++) {
      const bundleId = generateLocksBundleId();
      expect(locksBundleIdSchema.safeParse(bundleId).success).toBe(true);
    }
  });

  it('produces unique handles', () => {
    const ids = new Set(Array.from({ length: 64 }, () => generateLocksBundleId()));
    expect(ids.size).toBe(64);
  });
});

describe('toBareLockResource', () => {
  it('converts a policy URI into the bare form the service contract accepts', () => {
    const bare = toBareLockResource(`pubky://${CREATOR}/pub/locks.app/${LOCK_ID}.json`);
    expect(bare).toBe(`${CREATOR}/pub/locks.app/${LOCK_ID}.json`);
    expect(locksBareLockResourceSchema.safeParse(bare).success).toBe(true);
  });

  it('rejects URIs outside the Locks namespace', () => {
    expect(toBareLockResource(`pubky://${CREATOR}/pub/pubky.app/marketplace/v1/listings/x`)).toBeNull();
    expect(toBareLockResource(`https://${CREATOR}/pub/locks.app/${LOCK_ID}.json`)).toBeNull();
    expect(toBareLockResource('')).toBeNull();
  });
});

describe('lockPolicyCreator', () => {
  it('extracts the creator pubky', () => {
    expect(lockPolicyCreator(`pubky://${CREATOR}/pub/locks.app/${LOCK_ID}.json`)).toBe(CREATOR);
    expect(lockPolicyCreator('not-a-policy-uri')).toBeNull();
  });
});

describe('buyerVisiblePaymentStatus', () => {
  it('folds detected into awaiting entitlement — detection stays internal', () => {
    expect(buyerVisiblePaymentStatus('detected')).toBe('awaiting_entitlement');
  });

  it('maps the buyer-visible states to themselves', () => {
    expect(buyerVisiblePaymentStatus('awaiting_entitlement')).toBe('awaiting_entitlement');
    expect(buyerVisiblePaymentStatus('confirmed')).toBe('confirmed');
    expect(buyerVisiblePaymentStatus('expired')).toBe('expired');
    expect(buyerVisiblePaymentStatus('manual_review')).toBe('manual_review');
  });
});
