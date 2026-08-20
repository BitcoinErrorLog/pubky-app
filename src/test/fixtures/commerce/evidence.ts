import type { MarketplaceDisputeCaseFile, MarketplaceDisputeEvidence } from '@/services/marketplace/marketplace';
import { ORDER_FIXTURE_BUYER, ORDER_FIXTURE_SELLER } from './orders';

function uuid(seed: number): string {
  const hex = seed.toString(16).padStart(12, '0');
  return `018f47d2-6a27-7c23-b917-${hex}`;
}

/**
 * Case-file items as the scoped read serves them: newest first, one from
 * each dispute participant, with fixed ids and timestamps so VRT baselines
 * stay stable.
 */
export function createEvidenceFixtures(): MarketplaceDisputeEvidence[] {
  return [
    {
      id: uuid(2),
      submitterPubky: ORDER_FIXTURE_SELLER,
      body: 'Package left our workshop intact; the courier scan shows no damage exception until the destination depot.',
      bodyBytes: 106,
      createdAt: '2026-08-19T15:30:00.000Z',
    },
    {
      id: uuid(1),
      submitterPubky: ORDER_FIXTURE_BUYER,
      body: 'Both boots arrived with split soles. Photo content hashes: a1b2c3d4, e5f6a7b8.',
      bodyBytes: 79,
      createdAt: '2026-08-19T13:00:00.000Z',
    },
  ];
}

export function createCaseFileFixture(
  orderId: string,
  evidence: MarketplaceDisputeEvidence[] = createEvidenceFixtures(),
): MarketplaceDisputeCaseFile {
  return { orderId, evidence };
}
