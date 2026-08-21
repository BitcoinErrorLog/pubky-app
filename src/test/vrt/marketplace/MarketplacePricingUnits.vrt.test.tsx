// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { useForm } from 'react-hook-form';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';
import {
  type CreateMarketplaceListingData,
  createMarketplaceListingDefaults,
} from '@/hooks/useCreateMarketplaceListing/useCreateMarketplaceListing.types';
import type { UseListingMediaManagerResult } from '@/hooks/useListingMediaManager/useListingMediaManager';
import { MarketplaceListingCard } from '@/organisms/Marketplace/MarketplaceListingCard';
import { MarketplaceListingForm } from '@/organisms/Marketplace/MarketplaceListingForm';
import { useMarketplaceDisplayStore } from '@/stores/marketplace-display/marketplace-display.store';

/**
 * Pricing-currency and measurement-unit scenarios:
 *
 * - Catalog cards with the indicative secondary price: a USD-priced card
 *   showing "≈ N sats" and a satoshi-priced card (BTC at exponent 8, the
 *   shape the live regtest purchase paid) showing sats as its PRIMARY price
 *   with "≈ $X" beneath. The BTC/USD rate is mocked to a fixed value — the
 *   estimate never renders from the network in VRT.
 * - The sell studio's package-dimension fields in both measurement systems:
 *   metric (cm/g) and imperial (in/oz), with the sats pricing currency
 *   selected in the imperial scenario to capture the sats price labels.
 */

// Deterministic BTC/USD rate for the capture (1 BTC = $100,000).
vi.mock('@/hooks/useIndicativeBtcRate/useIndicativeBtcRate', () => ({
  useIndicativeBtcRate: (enabled: boolean) =>
    enabled ? { satUsd: 0.001, btcUsd: 100_000, lastUpdatedAt: new Date('2026-08-21T00:00:00Z') } : null,
}));

// No live-bid reads in these captures: fixed-price cards only.
vi.mock('@/hooks/useMarketplaceLiveBid/useMarketplaceLiveBid', () => ({
  useMarketplaceLiveBid: () => ({ ref: () => {}, bid: null }),
}));

const fixtures = vi.hoisted(async () => {
  const { catalogItemFromCatalogEntry } = await import('@/hooks/useMarketplaceCatalog/useMarketplaceCatalog.utils');
  const { createCommerceCatalogEntryFixture } = await import('@/test/fixtures/commerce/commerce');

  const usdListing = catalogItemFromCatalogEntry(
    createCommerceCatalogEntryFixture({
      id: `${'u'.repeat(52)}:usd_boots`,
      seller_id: 'u'.repeat(52),
      listing_id: 'usd_boots',
      title: 'Vintage leather boots',
      media_urls: [],
      price: { amountMinor: 12_500, currency: 'USD', exponent: 2 },
    }),
  );

  // The exact money shape the live regtest purchase paid: BTC at exponent 8,
  // satoshis as minor units.
  const satsListing = catalogItemFromCatalogEntry(
    createCommerceCatalogEntryFixture({
      id: `${'s'.repeat(52)}:sats_camera`,
      seller_id: 's'.repeat(52),
      listing_id: 'sats_camera',
      title: '35mm rangefinder camera',
      category_id: 'electronics-cameras-film',
      condition: 'excellent',
      media_urls: [],
      price: { amountMinor: 15_000, currency: 'BTC', exponent: 8 },
    }),
  );

  return { usdListing, satsListing };
});

function buildMediaMock(): UseListingMediaManagerResult {
  return {
    items: [],
    maxPhotos: 8,
    error: null,
    inputRef: { current: null },
    onInputChange: vi.fn(),
    choose: vi.fn(),
    removeItem: vi.fn(),
    moveItem: vi.fn(),
    setAltText: vi.fn(),
    seed: vi.fn(),
    reset: vi.fn(),
    prepare: vi.fn(),
  };
}

function FormHarness({ values }: { values: Partial<CreateMarketplaceListingData> }) {
  const form = useForm<CreateMarketplaceListingData>({
    defaultValues: { ...createMarketplaceListingDefaults, ...values },
  });
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <MarketplaceListingForm form={form} media={buildMediaMock()} onSubmit={async () => {}} isPublishing={false} />
    </main>
  );
}

describe('Marketplace pricing and units — visual regression', () => {
  it('renders USD and sats cards with indicative secondary prices at desktop viewport', async () => {
    useMarketplaceDisplayStore.setState({ showFxEstimate: true, measurementSystem: 'metric' });
    const { usdListing, satsListing } = await fixtures;

    const screen = await renderForVRT(
      <main className="grid w-full grid-cols-2 gap-4 px-6 py-8">
        <MarketplaceListingCard listing={usdListing} shopName="Worn Well" />
        <MarketplaceListingCard listing={satsListing} shopName="Analog Optics" />
      </main>,
      { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true },
    );
    await expect.element(screen.getByText('≈ 125,000 sats')).toBeInTheDocument();
    await expect.element(screen.getByText('≈ $15.00')).toBeInTheDocument();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('pricing-cards-indicative-desktop');
  });

  it('renders the sell studio package fields in metric units at desktop viewport', async () => {
    useMarketplaceDisplayStore.setState({ showFxEstimate: true, measurementSystem: 'metric' });
    const screen = await renderForVRT(
      <FormHarness
        values={{
          measurementSystem: 'metric',
          shippingPrice: '12.00',
          packageWeight: '1200',
          packageLength: '35.0',
          packageWidth: '25.0',
          packageHeight: '15.0',
        }}
      />,
      { viewport: { width: 1440, height: 2400 }, disableHover: true },
    );
    await expect.element(screen.getByText('Weight (g)')).toBeInTheDocument();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('sell-studio-package-metric-desktop');
  });

  it('renders the sell studio package fields in imperial units with sats pricing at desktop viewport', async () => {
    useMarketplaceDisplayStore.setState({ showFxEstimate: true, measurementSystem: 'imperial' });
    const screen = await renderForVRT(
      <FormHarness
        values={{
          currency: 'SATS',
          price: '150000',
          measurementSystem: 'imperial',
          shippingPrice: '15000',
          packageWeight: '42.3',
          packageLength: '13.8',
          packageWidth: '9.8',
          packageHeight: '5.9',
        }}
      />,
      { viewport: { width: 1440, height: 2400 }, disableHover: true },
    );
    await expect.element(screen.getByText('Weight (oz)')).toBeInTheDocument();
    await expect.element(screen.getByText('Price (sats)')).toBeInTheDocument();
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('sell-studio-package-imperial-sats-desktop');
  });
});
