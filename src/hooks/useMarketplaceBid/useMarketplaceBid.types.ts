import { z } from 'zod';

export function marketplaceBidMinimum(
  currentPriceMinor: number,
  minimumIncrementMinor: number,
  ownMaximumMinor?: number,
): number {
  const visiblePriceMinimum = currentPriceMinor + minimumIncrementMinor;
  return ownMaximumMinor === undefined
    ? visiblePriceMinimum
    : Math.max(visiblePriceMinimum, ownMaximumMinor + minimumIncrementMinor);
}

export const marketplaceBidSchema = z.object({
  maximumAmount: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,2})?$/, 'Enter a valid maximum bid.')
    .refine((value) => Number(value) > 0, 'Maximum bid must be greater than zero.'),
});

export type MarketplaceBidData = z.infer<typeof marketplaceBidSchema>;

export const marketplaceBidDefaults: MarketplaceBidData = {
  maximumAmount: '',
};
