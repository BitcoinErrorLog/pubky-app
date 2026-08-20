import type { MarketplaceReport } from '@/services/marketplace/marketplace';

export const REPORT_FIXTURE_REPORTER = 'b'.repeat(52);

/**
 * Keyed record instead of a plain array so adding a reason to the report
 * schema union fails compilation here (missing key) instead of leaving the new
 * reason silently untested.
 */
const REPORT_REASON_DETAILS = {
  prohibited_item: 'Listing appears to offer a restricted weapon accessory.',
  counterfeit: 'Logo placement and stitching do not match the authentic product.',
  scam: 'Seller asks buyers to pay outside the marketplace before shipping.',
  harassment: 'Seller sent repeated abusive replies after a declined offer.',
  unsafe: 'Battery pack shows swelling in the photos and has a recall notice.',
  other: 'Description contradicts the photos in a way that misleads buyers.',
} as const satisfies Record<MarketplaceReport['reason'], string>;

/** Every report reason the marketplace report schema defines. */
export const REPORT_REASONS = Object.keys(REPORT_REASON_DETAILS) as readonly MarketplaceReport['reason'][];

/** Every report target type, cycled across the reason sweep so each renders. */
const REPORT_TARGET_TYPE_IDS = {
  listing: `listing:${'s'.repeat(52)}_leather_boots`,
  user: 's'.repeat(52),
  message: `message:${'s'.repeat(52)}_leather_boots`,
  review: `review:${'s'.repeat(52)}_leather_boots`,
} as const satisfies Record<MarketplaceReport['targetType'], string>;

export const REPORT_TARGET_TYPES = Object.keys(REPORT_TARGET_TYPE_IDS) as readonly MarketplaceReport['targetType'][];

function uuid(seed: number): string {
  const hex = seed.toString(16).padStart(12, '0');
  return `018f47d2-6a27-7c23-e841-${hex}`;
}

export function createReportFixture(
  reason: MarketplaceReport['reason'],
  overrides: Partial<MarketplaceReport> = {},
): MarketplaceReport {
  const reasonIndex = REPORT_REASONS.indexOf(reason) + 1;
  const targetType = REPORT_TARGET_TYPES[(reasonIndex - 1) % REPORT_TARGET_TYPES.length];
  return {
    id: uuid(reasonIndex),
    reporterPubky: REPORT_FIXTURE_REPORTER,
    targetType,
    targetId: REPORT_TARGET_TYPE_IDS[targetType],
    reason,
    details: REPORT_REASON_DETAILS[reason],
    state: 'open',
    createdAt: '2026-08-19T09:00:00.000Z',
    ...overrides,
  };
}

/** One open report per schema reason, cycling through every target type. */
export function createReportsForEveryReason(): MarketplaceReport[] {
  return REPORT_REASONS.map((reason) => createReportFixture(reason));
}
