// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplaceSell } from '@/templates/Marketplace/MarketplaceSell';

// 8x8 solid-color PNG so the "media attached" scenario shows a real preview
// without any network fetch or file-picker interaction.
const PREVIEW_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGN4UaKEFTEMLQkAgnNfgXMIh2kAAAAASUVORK5CYII=';

const draftFixture = vi.hoisted(() => ({
  id: 'draft_row_01',
  owner_id: 'y'.repeat(52),
  listing_id: 'draftlisting01',
  data: {
    form: {
      title: 'Vintage leather boots',
      description: 'Hand-finished leather boots with a softly worn patina. Resoled once.',
      categoryId: 'fashion',
      condition: 'good',
      countryCode: 'US',
      region: 'NY',
      saleFormat: 'fixed_price',
      price: '125.00',
      variants: [{ sku: 'BOOTS-42', size: '42', color: 'Brown', style: 'Classic', quantity: '1', priceOverride: '' }],
      fulfillment: 'physical',
      shippingPrice: '12.00',
      weightGrams: '1200',
      lengthMillimeters: '350',
      widthMillimeters: '250',
      heightMillimeters: '150',
      returnDays: '30',
      altText: 'Brown leather boots on a neutral background',
    },
  },
  created_at: 1_000,
  updated_at: 2_000,
}));

const view = vi.hoisted(() => ({
  drafts: [] as unknown[],
  previewUrl: null as string | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace/sell',
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'y'.repeat(52) }),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getListingDrafts: () => Promise.resolve(view.drafts),
    commitUpdateListingDraft: () => Promise.resolve(),
    commitDeleteListingDraft: () => Promise.resolve(),
    commitCreateMedia: () => Promise.resolve(),
    commitUpsertListing: () => Promise.resolve(),
  },
}));

vi.mock('@/hooks/useListingMediaPicker/useListingMediaPicker', () => ({
  useListingMediaPicker: () => ({
    file: null,
    previewUrl: view.previewUrl,
    error: null,
    inputRef: { current: null },
    onInputChange: vi.fn(),
    choose: vi.fn(),
    remove: vi.fn(),
    reset: vi.fn(),
    prepare: vi.fn(async () => null),
  }),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main className="w-full py-6">{children}</main>,
}));

describe('Marketplace sell studio — visual regression', () => {
  it('renders the empty listing form at desktop viewport', async () => {
    view.drafts = [];
    view.previewUrl = null;

    const screen = await renderForVRT(<MarketplaceSell />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('sell-empty-form-desktop');
  });

  it('renders the empty listing form at mobile viewport', async () => {
    view.drafts = [];
    view.previewUrl = null;

    const screen = await renderForVRT(<MarketplaceSell />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('sell-empty-form-mobile');
  });

  it('renders the form with an autosaved draft loaded at desktop viewport', async () => {
    view.drafts = [draftFixture];
    view.previewUrl = null;

    const screen = await renderForVRT(<MarketplaceSell />, { viewport: VRT_VIEWPORT_DESKTOP });
    await vi.waitFor(() => {
      const input = screen.container.querySelector<HTMLInputElement>('#title');
      if (input?.value !== draftFixture.data.form.title) throw new Error('Draft has not populated the form yet.');
    });
    // The populated title/description sit below the viewport crop, so bring
    // the item-details card into view — otherwise the baseline is nearly
    // indistinguishable from the empty form.
    screen.container.querySelector('#title')?.scrollIntoView({ block: 'center' });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('sell-draft-loaded-desktop');
  });

  it('renders the form with additional variants added at desktop viewport', async () => {
    view.drafts = [];
    view.previewUrl = null;

    const screen = await renderForVRT(<MarketplaceSell />, { viewport: VRT_VIEWPORT_DESKTOP });
    await screen.getByRole('button', { name: 'Add variant' }).click();
    await screen.getByRole('button', { name: 'Add variant' }).click();
    await vi.waitFor(() => {
      if (screen.container.querySelectorAll('input[name^="variants."][name$=".sku"]').length !== 3) {
        throw new Error('Variant rows have not rendered yet.');
      }
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('sell-variants-added-desktop');
  });

  it('renders the form with a media preview attached at desktop viewport', async () => {
    view.drafts = [];
    view.previewUrl = PREVIEW_DATA_URL;

    const screen = await renderForVRT(<MarketplaceSell />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('sell-media-attached-desktop');
  });

  it('renders validation errors after an empty submit at desktop viewport', async () => {
    view.drafts = [];
    view.previewUrl = null;

    const screen = await renderForVRT(<MarketplaceSell />, { viewport: VRT_VIEWPORT_DESKTOP });
    await screen.getByRole('button', { name: 'Publish listing' }).click();
    await vi.waitFor(() => {
      if (!screen.container.textContent?.includes('Title must be at least 3 characters.')) {
        throw new Error('Validation errors have not rendered yet.');
      }
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('sell-validation-errors-desktop');
  });
});
