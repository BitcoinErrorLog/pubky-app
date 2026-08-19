import { describe, expect, it } from 'vitest';
import { createMarketplaceListingDefaults, createMarketplaceListingSchema } from './useCreateMarketplaceListing.types';

describe('createMarketplaceListingSchema', () => {
  it('accepts complete physical delivery terms', () => {
    expect(
      createMarketplaceListingSchema.safeParse({
        ...createMarketplaceListingDefaults,
        title: 'Vintage leather boots',
        description: 'Well cared for boots with light wear.',
        price: '125.00',
        shippingPrice: '12.00',
        weightGrams: '1200',
        lengthMillimeters: '350',
        widthMillimeters: '250',
        heightMillimeters: '150',
        altText: 'Brown leather boots viewed from the side',
      }).success,
    ).toBe(true);
  });

  it('allows pickup without package or shipping fields', () => {
    expect(
      createMarketplaceListingSchema.safeParse({
        ...createMarketplaceListingDefaults,
        title: 'Vintage leather boots',
        description: 'Well cared for boots with light wear.',
        price: '125',
        fulfillment: 'pickup',
        altText: 'Brown leather boots viewed from the side',
      }).success,
    ).toBe(true);
  });

  it.each([
    ['zero price', { price: '0' }],
    ['fractional cents', { price: '1.001' }],
    ['zero quantity', { quantity: '0' }],
    ['invalid country', { countryCode: 'USA' }],
    ['missing alt text', { altText: '' }],
  ])('rejects %s', (_label, changes) => {
    const result = createMarketplaceListingSchema.safeParse({
      ...createMarketplaceListingDefaults,
      title: 'Vintage leather boots',
      description: 'Well cared for boots with light wear.',
      price: '125',
      fulfillment: 'pickup',
      altText: 'Brown leather boots',
      ...changes,
    });

    expect(result.success).toBe(false);
  });
});
