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
        packageWeight: '1200',
        packageLength: '35.0',
        packageWidth: '25.0',
        packageHeight: '15.0',
      }).success,
    ).toBe(true);
  });

  it('accepts imperial package inputs with one decimal', () => {
    expect(
      createMarketplaceListingSchema.safeParse({
        ...createMarketplaceListingDefaults,
        title: 'Vintage leather boots',
        description: 'Well cared for boots with light wear.',
        price: '125.00',
        shippingPrice: '12.00',
        measurementSystem: 'imperial',
        packageWeight: '42.3',
        packageLength: '13.8',
        packageWidth: '9.8',
        packageHeight: '5.9',
      }).success,
    ).toBe(true);
  });

  it('rejects fractional grams in metric but allows one-decimal ounces in imperial', () => {
    const base = {
      ...createMarketplaceListingDefaults,
      title: 'Vintage leather boots',
      description: 'Well cared for boots with light wear.',
      price: '125.00',
      shippingPrice: '12.00',
      packageLength: '35.0',
      packageWidth: '25.0',
      packageHeight: '15.0',
    };
    expect(createMarketplaceListingSchema.safeParse({ ...base, packageWeight: '1200.5' }).success).toBe(false);
    expect(
      createMarketplaceListingSchema.safeParse({ ...base, measurementSystem: 'imperial', packageWeight: '42.3' })
        .success,
    ).toBe(true);
  });

  it('accepts whole-sats pricing and rejects decimal sats', () => {
    const base = {
      ...createMarketplaceListingDefaults,
      title: 'Vintage leather boots',
      description: 'Well cared for boots with light wear.',
      currency: 'SATS' as const,
      fulfillment: 'pickup' as const,
    };
    expect(createMarketplaceListingSchema.safeParse({ ...base, price: '150000' }).success).toBe(true);
    expect(createMarketplaceListingSchema.safeParse({ ...base, price: '150000.5' }).success).toBe(false);
    expect(createMarketplaceListingSchema.safeParse({ ...base, price: '0' }).success).toBe(false);
  });

  it('validates variant price overrides and shipping in the chosen currency', () => {
    const base = {
      ...createMarketplaceListingDefaults,
      title: 'Vintage leather boots',
      description: 'Well cared for boots with light wear.',
      currency: 'SATS' as const,
      price: '150000',
      shippingPrice: '15000',
      packageWeight: '1200',
      packageLength: '35.0',
      packageWidth: '25.0',
      packageHeight: '15.0',
    };
    const satsOverride = [{ sku: '', size: '', color: '', style: '', quantity: '1', priceOverride: '175000' }];
    const decimalOverride = [{ sku: '', size: '', color: '', style: '', quantity: '1', priceOverride: '175000.50' }];
    expect(createMarketplaceListingSchema.safeParse({ ...base, variants: satsOverride }).success).toBe(true);
    expect(createMarketplaceListingSchema.safeParse({ ...base, variants: decimalOverride }).success).toBe(false);
    expect(createMarketplaceListingSchema.safeParse({ ...base, shippingPrice: '15000.50' }).success).toBe(false);
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
