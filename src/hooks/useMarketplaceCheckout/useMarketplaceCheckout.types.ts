import { z } from 'zod';

export const marketplaceCheckoutSchema = z
  .object({
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
    // Client-only address book controls; never part of the checkout command.
    saveAddress: z.boolean(),
    saveLabel: z.string().trim().max(40, 'Keep the label under 40 characters.'),
  })
  .superRefine((data, context) => {
    if (data.saveAddress && !data.saveLabel) {
      context.addIssue({ code: 'custom', path: ['saveLabel'], message: 'Give the saved address a label.' });
    }
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
  saveAddress: false,
  saveLabel: '',
};

/** The checkout fields a saved address fills (everything except the guarantee and save controls). */
export const MARKETPLACE_CHECKOUT_ADDRESS_FIELDS = [
  'name',
  'line1',
  'line2',
  'city',
  'region',
  'postalCode',
  'countryCode',
] as const;

export type MarketplaceCheckoutAddressField = (typeof MARKETPLACE_CHECKOUT_ADDRESS_FIELDS)[number];
