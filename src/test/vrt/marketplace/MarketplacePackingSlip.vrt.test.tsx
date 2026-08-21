// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplacePackingSlipDialog } from '@/organisms/Marketplace/MarketplacePackingSlipDialog';

// The seller's print-friendly packing slip. The slip renders ONLY what the
// seller's client legitimately holds — the participant order projection — so
// the baseline must show the truthful "Deliver to" notice (the delivery
// address is withheld from all reads by design, ADR-0019 §8) instead of an
// address block.
const fixtures = vi.hoisted(async () => {
  const { createOrderFixture } = await import('@/test/fixtures/commerce/orders');
  return {
    paidOrder: createOrderFixture('paid'),
    shippedOrder: createOrderFixture('shipped', {
      shipment: {
        carrier: 'USPS',
        trackingNumber: '9400111899223197428490',
        state: 'shipped' as const,
        shippedAt: '2026-08-14T10:00:00.000Z',
        deliveredAt: null,
      },
    }),
  };
});

async function openSlip(trigger: { click: () => Promise<void> }) {
  await trigger.click();
  await vi.waitFor(() => {
    if (!document.querySelector('[data-packing-slip]')) throw new Error('The packing slip has not opened yet.');
  });
}

function SlipHarness({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-10">{children}</main>;
}

describe('Marketplace packing slip — visual regression', () => {
  it('renders the packing slip for a paid order at desktop viewport', async () => {
    const { paidOrder } = await fixtures;

    const screen = await renderForVRT(
      <SlipHarness>
        <MarketplacePackingSlipDialog order={paidOrder} />
      </SlipHarness>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await openSlip(screen.getByRole('button', { name: 'Packing slip' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('packing-slip-paid-desktop');
  });

  it('renders the packing slip for a paid order at mobile viewport', async () => {
    const { paidOrder } = await fixtures;

    const screen = await renderForVRT(
      <SlipHarness>
        <MarketplacePackingSlipDialog order={paidOrder} />
      </SlipHarness>,
      { viewport: VRT_VIEWPORT_MOBILE },
    );
    await openSlip(screen.getByRole('button', { name: 'Packing slip' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('packing-slip-paid-mobile');
  });

  it('renders the packing slip with shipment facts at desktop viewport', async () => {
    const { shippedOrder } = await fixtures;

    const screen = await renderForVRT(
      <SlipHarness>
        <MarketplacePackingSlipDialog order={shippedOrder} />
      </SlipHarness>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await openSlip(screen.getByRole('button', { name: 'Packing slip' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('packing-slip-shipped-desktop');
  });
});
