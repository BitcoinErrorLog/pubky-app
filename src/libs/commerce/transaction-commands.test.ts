import { describe, expect, it } from 'vitest';
import {
  createReviewCommandSchema,
  isMarketplaceRevisionConflict,
  marketplaceCommandSchema,
  updateReviewCommandSchema,
} from './transaction-commands';

const ORDER_ID = '018f47d2-6a27-7c23-a62f-000000000720';

function reviewCommand(kind: 'review.create' | 'review.update', payload: Record<string, unknown> = {}) {
  return {
    version: 1,
    commandId: '018f47d2-6a27-7c23-a62f-000000000721',
    aggregateId: `order:${ORDER_ID}`,
    expectedRevision: 3,
    issuedAt: '2026-08-20T12:00:00.000Z',
    kind,
    payload: { orderId: ORDER_ID, rating: 4, text: 'Solid transaction, fast shipping.', ...payload },
  };
}

// `review.create` and `review.update` share the service's single
// ReviewTermsPayload validator, so both kinds are exercised against the same
// bounds: integer rating 1–5 and trimmed text of 1–5,000 characters.
describe.each([
  ['review.create', createReviewCommandSchema],
  ['review.update', updateReviewCommandSchema],
] as const)('%s command contract', (kind, schema) => {
  it('accepts a payload matching the service validator', () => {
    const parsed = schema.parse(reviewCommand(kind));

    expect(parsed.kind).toBe(kind);
    expect(parsed.payload).toEqual({ orderId: ORDER_ID, rating: 4, text: 'Solid transaction, fast shipping.' });
  });

  it('is a member of the marketplace command union', () => {
    expect(marketplaceCommandSchema.parse(reviewCommand(kind)).kind).toBe(kind);
  });

  it.each([0, 6, 3.5])('rejects the out-of-bounds rating %s', (rating) => {
    expect(schema.safeParse(reviewCommand(kind, { rating })).success).toBe(false);
  });

  it('rejects empty and whitespace-only text', () => {
    expect(schema.safeParse(reviewCommand(kind, { text: '' })).success).toBe(false);
    expect(schema.safeParse(reviewCommand(kind, { text: '   ' })).success).toBe(false);
  });

  it('accepts text at the 5,000-character bound and rejects one character more', () => {
    expect(schema.safeParse(reviewCommand(kind, { text: 'a'.repeat(5_000) })).success).toBe(true);
    expect(schema.safeParse(reviewCommand(kind, { text: 'a'.repeat(5_001) })).success).toBe(false);
  });

  it('rejects unknown payload fields, mirroring the service deny_unknown_fields', () => {
    expect(schema.safeParse(reviewCommand(kind, { deliveryAddress: 'leak' })).success).toBe(false);
  });

  it('rejects a non-uuid order id', () => {
    expect(schema.safeParse(reviewCommand(kind, { orderId: 'not-a-uuid' })).success).toBe(false);
  });
});

describe('review.update revision conflict handling', () => {
  it('classifies the 409 REVISION_CONFLICT answer for the refetch-and-retry pattern', () => {
    expect(
      isMarketplaceRevisionConflict({
        ok: false,
        error: { code: 'REVISION_CONFLICT', message: 'The order revision is stale.', currentRevision: 4 },
      }),
    ).toBe(true);
  });

  it('does not classify the closed-window INVALID_STATE answer as retriable', () => {
    expect(
      isMarketplaceRevisionConflict({
        ok: false,
        error: { code: 'INVALID_STATE', message: 'The review edit window has closed.' },
      }),
    ).toBe(false);
  });
});
