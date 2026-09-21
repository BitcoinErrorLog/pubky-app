import { describe, expect, it } from 'vitest';
import { getAuctionPhase, isAuctionSaleEnded, listingDisplayState } from './auction-phase';

const startsAt = '2026-09-09T10:00:00.000Z';
const endsAt = '2026-09-09T11:00:00.000Z';

describe('getAuctionPhase', () => {
  it('treats the exact end boundary as ended', () => {
    expect(getAuctionPhase(startsAt, endsAt, Date.parse(endsAt))).toBe('ended');
  });

  it('treats time before the start as upcoming', () => {
    expect(getAuctionPhase(startsAt, endsAt, Date.parse(startsAt) - 1)).toBe('upcoming');
  });
});

describe('isAuctionSaleEnded', () => {
  it('is false for fixed-price sales', () => {
    expect(isAuctionSaleEnded({ format: 'fixed_price' }, Date.parse(endsAt) + 1)).toBe(false);
  });

  it('follows the listing record clock when no service status is supplied', () => {
    expect(isAuctionSaleEnded({ format: 'auction', startsAt, endsAt }, Date.parse(endsAt))).toBe(true);
    expect(isAuctionSaleEnded({ format: 'auction', startsAt, endsAt }, Date.parse(endsAt) - 1)).toBe(false);
  });
});

describe('listingDisplayState', () => {
  it('keeps non-active states', () => {
    expect(listingDisplayState('paused', { format: 'auction', startsAt, endsAt }, Date.parse(endsAt) + 1)).toBe(
      'paused',
    );
  });

  it('surfaces ended for an active auction whose end time has passed', () => {
    expect(listingDisplayState('active', { format: 'auction', startsAt, endsAt }, Date.parse(endsAt))).toBe('ended');
  });

  it('uses the caller clock, not wall time', () => {
    expect(listingDisplayState('active', { format: 'auction', startsAt, endsAt }, Date.parse(endsAt) - 1)).toBe(
      'active',
    );
    expect(listingDisplayState('active', { format: 'auction', startsAt, endsAt }, Date.parse(endsAt))).toBe('ended');
  });
});
