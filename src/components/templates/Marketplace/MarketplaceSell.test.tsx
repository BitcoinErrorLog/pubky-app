import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMarketplaceListingEditRoute, getMarketplaceListingRoute } from '@/app/routes';
import {
  type CreateMarketplaceListingData,
  createMarketplaceListingDefaults,
} from '@/hooks/useCreateMarketplaceListing/useCreateMarketplaceListing.types';
import type { UseListingMediaManagerResult } from '@/hooks/useListingMediaManager/useListingMediaManager';
import { MarketplaceSell } from './MarketplaceSell';

// A published-with-pickup listing still needs its meeting point, and the
// pickup-details editor only exists post-publish — so the sell studio routes
// to the edit page's pickup section when the form's fulfillment includes
// pickup, and to the public listing page otherwise. The hook is mocked at
// its boundary; the router push is the assertion target.
const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => '/marketplace/sell',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

// Keep the deployment's pickup capability ON: the default sandbox mode reads
// false and would coerce the form's fulfillment to shipping before publish.
vi.mock('@/controllers/commerce/commerce', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/controllers/commerce/commerce')>();
  return {
    ...actual,
    CommerceController: {
      ...actual.CommerceController,
      fetchPickupAvailable: () => Promise.resolve(true),
    },
  };
});

const createListing = vi.hoisted(() => ({
  fulfillment: 'shipping' as CreateMarketplaceListingData['fulfillment'],
  submitResult: 'seller:boots_01' as string | null,
  adapterMode: 'sandbox' as 'sandbox' | 'transaction-service',
  marketplaceSession: {
    pubky: 'y'.repeat(52),
    capabilities: '/pub/pubky.app/:rw',
    expiresAt: '2026-09-14T00:00:00.000Z',
    issuedAt: '2026-09-13T00:00:00.000Z',
  } as object | null,
  pendingRestore: null as { listingId: string; updatedAt: number; title: string; extraCount: number } | null,
  restoredDraft: false,
  submit: vi.fn(async () => createListing.submitResult),
  flushDraft: vi.fn(async () => undefined),
  resumeDraft: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@/config/commerce', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/commerce')>();
  return { ...actual, getCommerceAdapterMode: () => createListing.adapterMode };
});

vi.mock('@/stores/commerce/commerce.store', () => ({
  useCommerceStore: {
    getState: () => ({ marketplaceSession: createListing.marketplaceSession }),
  },
}));

vi.mock('@/organisms/Marketplace/MarketplaceSessionConnectDialog', () => ({
  MarketplaceSessionConnectDialog: ({ autoOpen }: { autoOpen?: boolean }) =>
    autoOpen ? (
      <div role="dialog" aria-label="Approve purchases">
        The approval expired before it was completed. Try again.
      </div>
    ) : null,
}));

vi.mock('@/hooks/useCreateMarketplaceListing/useCreateMarketplaceListing', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/useCreateMarketplaceListing/useCreateMarketplaceListing')>();
  return {
    ...actual,
    useCreateMarketplaceListing: () => {
      const form = useForm<CreateMarketplaceListingData>({
        defaultValues: {
          ...createMarketplaceListingDefaults,
          fulfillment: createListing.fulfillment,
          title: 'Vintage leather boots',
          description: 'Well cared for boots with light wear.',
          categoryId: 'fashion-shoes-boots',
          price: '125.00',
          // Publish-ready even when the fulfillment keeps shipping fields.
          shippingPrice: '12.00',
          packageWeight: '800',
          packageLength: '32',
          packageWidth: '22',
          packageHeight: '12',
        },
      });
      return {
        form,
        media: {
          items: [
            {
              key: 'one',
              kind: 'new',
              file: new File(['x'], 'one.jpg', { type: 'image/jpeg' }),
              previewUrl: 'blob:one',
              altText: 'Vintage leather boot',
            },
          ],
          maxPhotos: 8,
          error: null,
          inputRef: { current: null },
          onInputChange: vi.fn(),
          choose: vi.fn(),
          removeItem: vi.fn(),
          moveItem: vi.fn(),
          setAltText: vi.fn(),
          seed: vi.fn(),
          restore: vi.fn(),
          reset: vi.fn(),
          prepare: vi.fn(),
        } satisfies UseListingMediaManagerResult,
        draftId: 'draft-1',
        restoredDraft: createListing.restoredDraft,
        pendingRestore: createListing.pendingRestore,
        activeSectionId: 'listing-section-photos',
        setActiveSectionId: vi.fn(),
        seededFromTitle: null,
        seededAuctionAsFixedPrice: false,
        submit: createListing.submit,
        reset: createListing.reset,
        resumeDraft: createListing.resumeDraft,
        flushDraft: createListing.flushDraft,
        publishBlocked: null,
      };
    },
  };
});

describe('MarketplaceSell publish routing (local pickup, §A1)', () => {
  beforeEach(() => {
    routerPush.mockClear();
    createListing.submitResult = 'seller:boots_01';
    createListing.adapterMode = 'sandbox';
    createListing.marketplaceSession = {
      pubky: 'y'.repeat(52),
      capabilities: '/pub/pubky.app/:rw',
      expiresAt: '2026-09-14T00:00:00.000Z',
      issuedAt: '2026-09-13T00:00:00.000Z',
    };
    createListing.pendingRestore = null;
    createListing.restoredDraft = false;
    createListing.submit.mockClear();
    createListing.flushDraft.mockClear();
    createListing.resumeDraft.mockClear();
    createListing.reset.mockClear();
    createListing.submit.mockImplementation(async () => createListing.submitResult);
  });

  it('routes to the public listing page after publishing a shipped listing', async () => {
    createListing.fulfillment = 'shipping';
    const user = userEvent.setup();
    render(<MarketplaceSell />);

    await user.click(screen.getByRole('button', { name: 'Publish listing' }));

    await vi.waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith(getMarketplaceListingRoute('seller', 'boots_01'));
    });
  });

  it('routes to the edit page pickup section after publishing with pickup selected', async () => {
    createListing.fulfillment = 'pickup';
    const user = userEvent.setup();
    render(<MarketplaceSell />);

    await user.click(screen.getByRole('button', { name: 'Publish listing' }));

    await vi.waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith(
        `${getMarketplaceListingEditRoute('seller', 'boots_01')}#listing-section-shipping`,
      );
    });
  });

  it('asks to resume a stored draft instead of silently hydrating', () => {
    createListing.pendingRestore = {
      listingId: 'draftlisting01',
      updatedAt: Date.parse('2026-09-22T07:00:00.000Z'),
      title: 'Vintage leather boots',
      extraCount: 1,
    };
    render(<MarketplaceSell />);

    expect(screen.getByRole('status')).toHaveAttribute('data-surface', 'listing-draft-restore-prompt');
    expect(screen.getByText('Vintage leather boots · 1 more in Seller studio')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(createListing.resumeDraft).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(createListing.reset).toHaveBeenCalledOnce();
  });

  it('flushes the draft and keeps the composer when the grant dialog reports approval expired', async () => {
    createListing.adapterMode = 'transaction-service';
    createListing.marketplaceSession = null;
    const user = userEvent.setup();
    render(<MarketplaceSell />);

    await user.click(screen.getByRole('button', { name: 'Publish listing' }));

    await vi.waitFor(() => {
      expect(createListing.flushDraft).toHaveBeenCalledOnce();
    });
    expect(createListing.submit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Approve purchases' })).toHaveTextContent(
      'The approval expired before it was completed. Try again.',
    );
    expect(screen.getByRole('heading', { name: 'Create a listing' })).toBeInTheDocument();
    expect(createListing.reset).not.toHaveBeenCalled();
  });
});
