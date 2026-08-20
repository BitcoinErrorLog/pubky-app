import { z } from 'zod';

/** Mirrors the service's `dispute.evidence` payload bounds (1–2000 chars, trimmed). */
export const marketplaceDisputeEvidenceFormSchema = z.object({
  body: z.string().trim().min(1, 'Evidence text is required.').max(2_000),
});

export type MarketplaceDisputeEvidenceFormData = z.infer<typeof marketplaceDisputeEvidenceFormSchema>;

export const marketplaceDisputeEvidenceFormDefaults: MarketplaceDisputeEvidenceFormData = {
  body: '',
};

/** Mirrors the service's `dispute.resolve` payload: one of the four remedies plus a rationale. */
export const marketplaceDisputeResolveFormSchema = z.object({
  resolution: z.enum(['buyer_refund', 'partial_refund', 'seller_favor', 'replacement']),
  rationale: z.string().trim().min(1, 'A rationale is required.').max(2_000),
});

export type MarketplaceDisputeResolveFormData = z.infer<typeof marketplaceDisputeResolveFormSchema>;

export const marketplaceDisputeResolveFormDefaults: MarketplaceDisputeResolveFormData = {
  resolution: 'buyer_refund',
  rationale: '',
};
