import { describe, expect, it } from 'vitest';
import { marketplaceListingProjectionSchema } from '@/core/services/marketplace/marketplace-projections';
import { serviceListingProjectionWire as serviceListingSample } from '@/test/fixtures/commerce/listing-projection.wire';
import {
  DIGITAL_DELIVERY_COPY,
  digitalContentTypeLabel,
  digitalDeliveryBadgeLabel,
  formatDigitalFileSize,
  isInstantDigitalDeliveryKind,
  marketplaceListingDigitalDeliveryFieldSchema,
} from './digital';
import { marketplaceHealthSchema } from './pickup';
import { toCamelCaseWire } from './wire-casing';

describe('digital delivery listing projection (§7 input inventory)', () => {
  it('parses the file facts the service projects (model.rs digital_delivery_projection)', () => {
    const wire = {
      ...serviceListingSample(),
      fulfillment_methods: ['digital'],
      digital_delivery: { kind: 'file', content_type: 'application/pdf', size_bytes: 12_582_912 },
    };
    const parsed = marketplaceListingProjectionSchema.parse(toCamelCaseWire(wire));
    expect(parsed.fulfillmentMethods).toEqual(['digital']);
    expect(parsed.digitalDelivery).toEqual({ kind: 'file', contentType: 'application/pdf', sizeBytes: 12_582_912 });
  });

  it('reads the committed service sample (delivery not set) as null', () => {
    const parsed = marketplaceListingProjectionSchema.parse(toCamelCaseWire(serviceListingSample()));
    expect(parsed.digitalDelivery ?? null).toBeNull();
  });

  it('reads a service predating digital delivery (no field) as absent', () => {
    const wire = { ...serviceListingSample() };
    delete wire.digital_delivery;
    const parsed = marketplaceListingProjectionSchema.parse(toCamelCaseWire(wire));
    expect(parsed.digitalDelivery ?? null).toBeNull();
  });

  it('drops a malformed sub-object instead of failing the listing', () => {
    for (const malformed of [{ kind: 'bundle' }, { kind: 'file', size_bytes: -1 }, 'file', 7]) {
      const wire = { ...serviceListingSample(), digital_delivery: malformed };
      const parsed = marketplaceListingProjectionSchema.parse(toCamelCaseWire(wire));
      expect(parsed.digitalDelivery, JSON.stringify(malformed)).toBeNull();
    }
    expect(marketplaceListingDigitalDeliveryFieldSchema.parse({ kind: 'email' })).toEqual({ kind: 'email' });
  });
});

describe('digital delivery capability (/health, §6 B5)', () => {
  it('reads the flags the service reports', () => {
    const health = marketplaceHealthSchema.parse(
      toCamelCaseWire({ status: 'ok', digital_delivery_available: true, digital_delivery_max_bytes: 52_428_800 }),
    );
    expect(health.digitalDeliveryAvailable).toBe(true);
    expect(health.digitalDeliveryMaxBytes).toBe(52_428_800);
  });

  it('shop_absent_capability_is_false', () => {
    const health = marketplaceHealthSchema.parse({ status: 'ok' });
    expect(health.digitalDeliveryAvailable).toBe(false);
    expect(health.digitalDeliveryMaxBytes).toBeUndefined();
  });

  it('treats a malformed flag as off without failing the health read', () => {
    const health = marketplaceHealthSchema.parse({
      status: 'ok',
      pickupAvailable: true,
      digitalDeliveryAvailable: 'yes',
      digitalDeliveryMaxBytes: -5,
    });
    expect(health.pickupAvailable).toBe(true);
    expect(health.digitalDeliveryAvailable).toBe(false);
    expect(health.digitalDeliveryMaxBytes).toBeUndefined();
  });
});

describe('digital delivery listing badge (§3)', () => {
  it('describes a file by type and size', () => {
    expect(digitalDeliveryBadgeLabel({ kind: 'file', contentType: 'application/pdf', sizeBytes: 12_582_912 })).toBe(
      'Instant download · PDF · 12 MB',
    );
    expect(digitalDeliveryBadgeLabel({ kind: 'file', sizeBytes: 4_404_019 })).toBe('Instant download · 4.2 MB');
    expect(digitalDeliveryBadgeLabel({ kind: 'file' })).toBe('Instant download');
  });

  it('never echoes a seller-supplied content type', () => {
    expect(digitalContentTypeLabel('application/x-anything-the-seller-typed')).toBeNull();
    expect(digitalDeliveryBadgeLabel({ kind: 'file', contentType: 'text/html; <script>' })).toBe('Instant download');
  });

  it('labels the other kinds', () => {
    expect(digitalDeliveryBadgeLabel({ kind: 'link' })).toBe(DIGITAL_DELIVERY_COPY.instantAccess);
    expect(digitalDeliveryBadgeLabel({ kind: 'text' })).toBe(DIGITAL_DELIVERY_COPY.instantAccess);
    expect(digitalDeliveryBadgeLabel({ kind: 'email' })).toBe('Emailed by the seller after payment');
    expect(digitalDeliveryBadgeLabel({ kind: 'message' })).toBe(DIGITAL_DELIVERY_COPY.messaged);
    expect(digitalDeliveryBadgeLabel(null)).toBe('Digital delivery');
  });

  it('formats sizes the way buyers read them', () => {
    expect(formatDigitalFileSize(300)).toBe('1 KB');
    expect(formatDigitalFileSize(839_680)).toBe('820 KB');
    expect(formatDigitalFileSize(52_428_800)).toBe('50 MB');
  });

  it('releases file, link and text at confirmation; email and message are manual', () => {
    expect(['file', 'link', 'text'].every((kind) => isInstantDigitalDeliveryKind(kind as never))).toBe(true);
    expect(isInstantDigitalDeliveryKind('email')).toBe(false);
    expect(isInstantDigitalDeliveryKind('message')).toBe(false);
  });
});
