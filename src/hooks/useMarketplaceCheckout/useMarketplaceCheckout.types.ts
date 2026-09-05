import { z } from 'zod';

export const marketplaceCheckoutSchema = z
  .object({
    name: z.string().trim().max(100),
    line1: z.string().trim().max(200),
    line2: z.string().trim().max(200),
    city: z.string().trim().max(100),
    region: z.string().trim().max(100),
    postalCode: z.string().trim().max(32),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, 'Use a two-letter country code.'),
    acceptsGuarantee: z.literal(true, { error: 'Accept the sandbox guarantee terms.' }),
    // Client-only address book controls; never part of the checkout command.
    saveAddress: z.boolean(),
    saveLabel: z.string().trim().max(40, 'Keep the label under 40 characters.'),
    // Set by the cart when every line is pickup-only: address fields are not
    // required and the checkout command carries no delivery address.
    isPickup: z.boolean(),
  })
  .superRefine((data, context) => {
    if (data.saveAddress && !data.saveLabel) {
      context.addIssue({ code: 'custom', path: ['saveLabel'], message: 'Give the saved address a label.' });
    }
    // Pickup orders skip address validation — the pickup address and handoff
    // instructions are revealed by the seller after payment.
    if (data.isPickup) return;
    for (const [field, message] of [
      ['name', 'Recipient name is required.'],
      ['line1', 'Address is required.'],
      ['city', 'City is required.'],
      ['region', 'Region is required.'],
      ['postalCode', 'Postal code is required.'],
    ] as const) {
      if (data[field].trim().length === 0) {
        context.addIssue({ code: 'custom', path: [field], message });
      }
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
  isPickup: false,
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
