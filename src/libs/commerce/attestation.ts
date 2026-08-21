import { verifyPurchaseAttestation } from 'pubky-app-specs';
import { z } from 'zod';
import type { CommerceReviewRecord } from '@/libs/commerce/marketplace-records';

/**
 * The purchase attestation as `review.create` / `review.update` return it
 * (ADR 0024): a compact JWS (EdDSA, `typ: pubky-purchase-attestation+v1`)
 * plus its decoded claims. The claims arrive camelCased by the wire-casing
 * boundary; the JWS string itself is the canonical artifact and is embedded
 * verbatim in the published review record's `eligibilityAttestation`.
 *
 * The `amountBand` claim is present only under both-sides consent (ratified
 * D2): the seller's standing preference AND the reviewer's per-review
 * opt-in.
 */
export const marketplaceAttestationSchema = z
  .object({
    jws: z
      .string()
      .min(32)
      .max(4_096)
      .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
    claims: z
      .object({
        v: z.literal(1),
        iss: z.string().length(52),
        sub: z.string().length(52),
        cpk: z.string().length(52),
        role: z.enum(['buyer_reviewing_seller', 'seller_reviewing_buyer']),
        listing: z.string().min(1),
        orderRef: z.string().regex(/^[0-9a-f]{64}$/),
        completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amountBand: z
          .string()
          .regex(/^[A-Z][A-Z0-9]{2,11}:\d{1,2}$/)
          .optional(),
        iat: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export type MarketplaceAttestation = z.infer<typeof marketplaceAttestationSchema>;

/**
 * Extracts the attestation from a successful review command result, or null
 * when the deployment issues none (a service without an attestor key still
 * accepts reviews — the absence is honest, not an error).
 */
export function extractReviewAttestation(result: Record<string, unknown>): MarketplaceAttestation | null {
  if (!('attestation' in result)) return null;
  const parsed = marketplaceAttestationSchema.safeParse(result.attestation);
  return parsed.success ? parsed.data : null;
}

/**
 * Runs the offline verification recipe on a review record's embedded
 * attestation via the specs crate (the normative implementation): parse the
 * compact JWS, verify the Ed25519 signature against the self-certifying
 * `iss` pubky, and check the claim bindings against the record. Returns the
 * verified issuer pubky, or null when anything fails. This proves the
 * attestation covers the record — whether `iss` is a *trusted* attestor
 * remains display policy.
 */
export function verifyOwnReviewAttestation(record: CommerceReviewRecord): string | null {
  try {
    const claims = verifyPurchaseAttestation({ ...record }) as { iss?: unknown };
    return typeof claims.iss === 'string' ? claims.iss : null;
  } catch {
    return null;
  }
}
