import type { MarketplacePayment } from '@/services/marketplace/marketplace-projections';

/**
 * Helpers for the real Locks/Paykit buyer payment flow (`locks-paykit` mode).
 *
 * The buyer's side of a real payment is deliberately small: generate a
 * lifecycle handle (the bundle id), submit a proof bundle to the Lock Server,
 * and register the correlation with the transaction service. Everything that
 * ADVANCES the payment happens server-side — the service worker independently
 * verifies the Locks lifecycle and confirms exactly once — so nothing in this
 * module (or anywhere else in the client) moves a payment forward.
 */

/** Crockford base32 alphabet (uppercase, no I/L/O/U) — the Locks `BundleId` wire encoding. */
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Encodes bytes as unpadded uppercase Crockford base32 (5 bits per character,
 * final group zero-padded), matching the upstream Locks identifier encoding.
 */
export function encodeCrockfordBase32(bytes: Uint8Array): string {
  let bits = '';
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let encoded = '';
  for (let index = 0; index < bits.length; index += 5) {
    encoded += CROCKFORD_ALPHABET[parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  }
  return encoded;
}

/**
 * Generates a fresh Locks bundle id: the canonical 26-character Crockford
 * base32 encoding of 128 cryptographically random bits. The bundle id is the
 * buyer's bearer handle for the verification lifecycle — whoever holds it can
 * look the lifecycle up and, once completed, obtain the access credential —
 * so it is stored only in the buyer's account-scoped private database and
 * never appears in public records, logs, or telemetry.
 */
export function generateLocksBundleId(): string {
  return encodeCrockfordBase32(crypto.getRandomValues(new Uint8Array(16)));
}

const POLICY_URI_PATTERN =
  /^pubky:\/\/([ybndrfg8ejkmcpqxot1uwisza345h769]{52})\/(pub\/locks\.app\/[A-Za-z0-9_./-]+\.json)$/;

/**
 * Converts a public Locks policy URI (`pubky://<creator>/pub/locks.app/<lock>.json`)
 * into the bare addressed form the transaction service's
 * `payment.register_locks` contract expects: `<creator>/pub/locks.app/<lock>.json`.
 * Returns null when the URI is not a well-formed Locks policy URI.
 */
export function toBareLockResource(policyUri: string): string | null {
  const match = POLICY_URI_PATTERN.exec(policyUri);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

/** Extracts the creator pubky (bare z-base-32) from a public Locks policy URI, or null. */
export function lockPolicyCreator(policyUri: string): string | null {
  return POLICY_URI_PATTERN.exec(policyUri)?.[1] ?? null;
}

/**
 * The payment states a buyer is shown. This is the whole vocabulary on
 * purpose (upstream contract, implementation-plan "Paykit, Locks, and payment
 * confirmation"): detected/underpaid/overpaid and confirmation counts are
 * internal to Locks/Paykit Server and MUST NOT be surfaced as settled facts —
 * an unconfirmed detection is not a payment. Only the visibly-labeled sandbox
 * may demonstrate the finer-grained simulated states.
 */
export type BuyerVisiblePaymentStatus = 'awaiting_entitlement' | 'confirmed' | 'expired' | 'manual_review';

/**
 * Folds the full payment state machine into the buyer-visible vocabulary:
 * `detected` renders as still-awaiting (the upstream contract keeps
 * detection/confirmation counts internal), everything else maps to itself.
 */
export function buyerVisiblePaymentStatus(state: MarketplacePayment['state']): BuyerVisiblePaymentStatus {
  return state === 'detected' ? 'awaiting_entitlement' : state;
}
