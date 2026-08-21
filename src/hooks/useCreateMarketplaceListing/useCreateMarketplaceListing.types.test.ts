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
      }).success,
    ).toBe(true);
  });

  it('supports multiple fixed-price variants but only one auction variant', () => {
    const variants = [
      { sku: 'BOOTS-42', size: '42', color: 'Brown', style: '', quantity: '1', priceOverride: '' },
      { sku: 'BOOTS-43', size: '43', color: 'Brown', style: '', quantity: '2', priceOverride: '135.00' },
    ];
    const base = {
      ...createMarketplaceListingDefaults,
      title: 'Vintage leather boots',
      description: 'Well cared for boots with light wear.',
      price: '125',
      fulfillment: 'pickup' as const,
      variants,
    };

    expect(createMarketplaceListingSchema.safeParse(base).success).toBe(true);
    expect(createMarketplaceListingSchema.safeParse({ ...base, saleFormat: 'auction' }).success).toBe(false);
  });

  it('requires unique non-empty seller SKUs', () => {
    const duplicate = { sku: 'BOOTS', size: '', color: '', style: '', quantity: '1', priceOverride: '' };
    expect(
      createMarketplaceListingSchema.safeParse({
        ...createMarketplaceListingDefaults,
        title: 'Vintage leather boots',
        description: 'Well cared for boots with light wear.',
        price: '125',
        fulfillment: 'pickup',
        variants: [duplicate, { ...duplicate, size: '43' }],
      }).success,
    ).toBe(false);
  });

  it.each([
    ['zero price', { price: '0' }],
    ['fractional cents', { price: '1.001' }],
    [
      'zero quantity',
      {
        variants: [
          {
            ...createMarketplaceListingDefaults.variants[0],
            quantity: '0',
          },
        ],
      },
    ],
    ['invalid country', { countryCode: 'USA' }],
  ])('rejects %s', (_label, changes) => {
    const result = createMarketplaceListingSchema.safeParse({
      ...createMarketplaceListingDefaults,
      title: 'Vintage leather boots',
      description: 'Well cared for boots with light wear.',
      price: '125',
      fulfillment: 'pickup',
      ...changes,
    });

    expect(result.success).toBe(false);
  });
});
