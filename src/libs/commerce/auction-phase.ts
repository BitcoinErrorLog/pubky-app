export type AuctionPhase = 'upcoming' | 'live' | 'ended';

export function getAuctionPhase(
  startsAt: string,
  endsAt: string,
  nowMs: number = Date.now(),
  status?: string,
): AuctionPhase {
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (status === 'ended' || status === 'closed') return 'ended';
  if (Number.isFinite(endMs) && nowMs >= endMs) return 'ended';
  if (Number.isFinite(startMs) && nowMs < startMs) return 'upcoming';
  return 'live';
}

export function isAuctionSaleEnded(
  sale: { format: string; startsAt?: string; endsAt?: string },
  nowMs: number = Date.now(),
  status?: string,
): boolean {
  if (sale.format !== 'auction') return false;
  return getAuctionPhase(sale.startsAt ?? '', sale.endsAt ?? '', nowMs, status) === 'ended';
}

export function listingDisplayState(
  state: string,
  sale: { format: string; startsAt?: string; endsAt?: string },
  nowMs: number = Date.now(),
): string {
  if (state === 'active' && isAuctionSaleEnded(sale, nowMs)) return 'ended';
  return state;
}
