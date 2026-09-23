import { describe, expect, it } from 'vitest';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import { activityRowHref, readOrderAnchorId, returnActivityTitle, returnActivityTitles } from './activity-links';

const SELLER = 's'.repeat(52);
const BUYER = 'b'.repeat(52);
const CONVERSATION = `conversation:${SELLER}_${BUYER}_listing-1`;
const ORDER = '018f47d2-6a27-7c23-a62f-000000000001';

describe('activityRowHref', () => {
  it('anchors an order event on that order', () => {
    expect(activityRowHref('return_updated', `order:${ORDER}`)).toBe(`${MARKETPLACE_ROUTES.ORDERS}#order-${ORDER}`);
    expect(activityRowHref('review_received', `order:${ORDER}`)).toBe(`${MARKETPLACE_ROUTES.ORDERS}#order-${ORDER}`);
  });

  it('anchors an offer and opens a message thread', () => {
    expect(activityRowHref('offer_received', 'offer:offer-1')).toBe(`${MARKETPLACE_ROUTES.OFFERS}#offer-offer-1`);
    expect(activityRowHref('message_received', CONVERSATION)).toBe(
      `${MARKETPLACE_ROUTES.MESSAGES}?conversation=${encodeURIComponent(CONVERSATION)}`,
    );
  });

  it('sends an auction row to the listing', () => {
    const href = activityRowHref('outbid', `listing:${SELLER}_boots`);
    expect(href).toContain(SELLER);
    expect(href).toContain('boots');
  });
});

describe('readOrderAnchorId', () => {
  it('reads only an order anchor', () => {
    expect(readOrderAnchorId(`#order-${ORDER}`)).toBe(ORDER);
    expect(readOrderAnchorId(`#${ORDER}`)).toBeNull();
  });
});

describe('return activity titles', () => {
  it('names the request, then the approval, then the receipt', () => {
    const reasons = new Map<string, string | null>([[ORDER, 'mistake on my part']]);
    const titles = returnActivityTitles(
      [
        { id: 'b', aggregateId: `order:${ORDER}`, createdAt: '2026-08-19T00:00:00.000Z' },
        { id: 'a', aggregateId: `order:${ORDER}`, createdAt: '2026-08-14T00:00:00.000Z' },
        { id: 'c', aggregateId: `order:${ORDER}`, createdAt: '2026-09-23T00:00:00.000Z' },
      ],
      reasons,
      true,
    );
    expect(titles.get('a')).toBe('Return requested — mistake on my part');
    expect(titles.get('b')).toBe('Return approved');
    expect(titles.get('c')).toBe('Return received');
  });

  it('keeps Return updated until the order is loaded', () => {
    const titles = returnActivityTitles(
      [{ id: 'a', aggregateId: `order:${ORDER}`, createdAt: '2026-08-14T00:00:00.000Z' }],
      new Map(),
      false,
    );
    expect(titles.get('a')).toBe('Return updated');
    expect(returnActivityTitle(0, null)).toBe('Return requested');
  });
});
