import { z } from 'zod';

export const marketplaceCheckoutSchema = z.object({
  name: z.string().trim().min(1, 'Recipient name is required.').max(100),
  line1: z.string().trim().min(1, 'Address is required.').max(200),
  line2: z.string().trim().max(200),
  city: z.string().trim().min(1, 'City is required.').max(100),
  region: z.string().trim().min(1, 'Region is required.').max(100),
  postalCode: z.string().trim().min(1, 'Postal code is required.').max(32),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Use a two-letter country code.'),
  acceptsGuarantee: z.literal(true, { error: 'Accept the sandbox guarantee terms.' }),
});

export type MarketplaceCheckoutData = z.infer<typeof marketplaceCheckoutSchema>;

export const marketplaceCheckoutDefaults: MarketplaceCheckoutData = {
  name: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  countryCode: 'US',
  acceptsGuarantee: true,
};
