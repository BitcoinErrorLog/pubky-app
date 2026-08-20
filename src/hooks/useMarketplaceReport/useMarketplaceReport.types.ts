import { z } from 'zod';

export const marketplaceReportSchema = z.object({
  reason: z.enum(['prohibited_item', 'counterfeit', 'scam', 'unsafe', 'other']),
  details: z.string().trim().min(1, 'Details are required.').max(2_000),
});

export type MarketplaceReportData = z.infer<typeof marketplaceReportSchema>;

export const marketplaceReportDefaults: MarketplaceReportData = {
  reason: 'prohibited_item',
  details: '',
};
