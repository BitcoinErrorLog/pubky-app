// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it } from 'vitest';
import { renderForVRT, VRT_DENSE_CHROME_SCREENSHOT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';
import { MarketplaceInventoryImport } from '@/organisms/Marketplace/MarketplaceInventoryImport';

describe('MarketplaceInventoryImport VRT', () => {
  it('renders the dry-run preview at desktop viewport', async () => {
    const screen = await renderForVRT(
      <main className="w-full py-6">
        <MarketplaceInventoryImport
          step={4}
          scene="dry-run"
          fileName="listings.csv"
          counts={{ create: 3, update: 1, end: 0, unchanged: 2, conflict: 0 }}
        />
      </main>,
      { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true },
    );
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot(
      'inventory-import-preview-desktop',
      VRT_DENSE_CHROME_SCREENSHOT,
    );
  });

  it('renders publish progress at desktop viewport', async () => {
    const screen = await renderForVRT(
      <main className="w-full py-6">
        <MarketplaceInventoryImport step={5} scene="progress" progress={{ done: 2, total: 10 }} />
      </main>,
      { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true },
    );
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot(
      'inventory-import-progress-desktop',
      VRT_DENSE_CHROME_SCREENSHOT,
    );
  });

  it('renders a CAS conflict at desktop viewport', async () => {
    const screen = await renderForVRT(
      <main className="w-full py-6">
        <MarketplaceInventoryImport
          step={5}
          scene="conflict"
          message="This listing changed since the plan. Confirm or discard; it will not be overwritten."
        />
      </main>,
      { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true },
    );
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot(
      'inventory-import-conflict-desktop',
      VRT_DENSE_CHROME_SCREENSHOT,
    );
  });
});
