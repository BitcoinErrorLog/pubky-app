import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMarketplaceListingEditRoute, getMarketplaceListingRoute } from '@/app/routes';
import {
  type CreateMarketplaceListingData,
  createMarketplaceListingDefaults,
} from '@/hooks/useCreateMarketplaceListing/useCreateMarketplaceListing.types';
import type { UseListingMediaManagerResult } from '@/hooks/useListingMediaManager/useListingMediaManager';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import { MarketplaceSell } from './MarketplaceSell';

// A published-with-pickup listing still needs its meeting point, and the
// pickup-details editor only exists post-publish — so the sell studio routes
// to the edit page's pickup section when the form's fulfillment includes
// pickup, and to the public listing page otherwise. The hook is mocked at
// its boundary; the router push is the assertion target.
const routerPush = vi.hoisted(() => vi.fn());
const commerceMode = vi.hoisted(() => ({ current: 'unavailable' as 'unavailable' | 'transaction-service' }));
const restorePersistedMarketplaceSession = vi.hoisted(() => vi.fn(() => null));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => '/marketplace/sell',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/config/commerce', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/commerce')>();
  return {
    ...actual,
    getCommerceAdapterMode: () => commerceMode.current,
  };
});

vi.mock('@/organisms/Marketplace/MarketplaceSessionConnectDialog', () => ({
  MarketplaceSessionConnectDialog: ({ autoOpen }: { autoOpen?: boolean }) =>
    autoOpen ? <div role="dialog" aria-label="Approve purchases" /> : null,
}));

vi.mock('@/hooks/useMarketplaceCartCount/useMarketplaceCartCount', () => ({
  useMarketplaceCartCount: () => 0,
}));

vi.mock('@/organisms/Marketplace/MarketplaceListingForm', () => ({
  MarketplaceListingForm: ({ onSubmit, isPublishing }: { onSubmit: () => void; isPublishing?: boolean }) => (
    <button type="button" onClick={() => void onSubmit()} disabled={isPublishing}>
      Publish listing
    </button>
  ),
}));

// Do not importOriginal this module: the real controller pulls
// @bitcoinerrorlog/pubky-shop, which this shared node_modules does not hold.
vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    fetchPickupAvailable: () => Promise.resolve(true),
    restorePersistedMarketplaceSession,
    getCartItems: () => Promise.resolve([]),
    getManyListings: () => Promise.resolve(new Map()),
    getShippingPresets: () => Promise.resolve([]),
  },
}));

const createListing = vi.hoisted(() => ({
  fulfillment: 'shipping' as CreateMarketplaceListingData['fulfillment'],
  submitResult: 'seller:boots_01' as string | null,
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
          reset: vi.fn(),
          prepare: vi.fn(),
        } satisfies UseListingMediaManagerResult,
        draftId: 'draft-1',
        restoredDraft: false,
        seededFromTitle: null,
        seededAuctionAsFixedPrice: false,
        submit: vi.fn(async () => createListing.submitResult),
        reset: vi.fn(),
      };
    },
  };
});

describe('MarketplaceSell publish routing (local pickup, §A1)', () => {
  beforeEach(() => {
    commerceMode.current = 'unavailable';
    routerPush.mockClear();
    createListing.submitResult = 'seller:boots_01';
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
});

describe('MarketplaceSell durable session gate', () => {
  const sellerPubky = 's'.repeat(52);

  beforeEach(() => {
    commerceMode.current = 'transaction-service';
    createListing.fulfillment = 'shipping';
    routerPush.mockClear();
    createListing.submitResult = 'seller:boots_01';
    useAuthStore.setState({ currentUserPubky: sellerPubky });
    useCommerceStore.getState().setMarketplaceSession(null);
  });

  afterEach(() => {
    commerceMode.current = 'unavailable';
    restorePersistedMarketplaceSession.mockReset();
    restorePersistedMarketplaceSession.mockReturnValue(null);
    useAuthStore.setState({ currentUserPubky: null });
    useCommerceStore.getState().setMarketplaceSession(null);
  });

  it('publishes after restoring a persisted marketplace session, without reconnect', async () => {
    restorePersistedMarketplaceSession.mockReturnValue({
      pubky: sellerPubky,
      capabilities: '',
      expiresAt: '2026-10-22T00:00:00.000Z',
      issuedAt: '2026-09-22T00:00:00.000Z',
    });
    const user = userEvent.setup();
    render(<MarketplaceSell />);

    await user.click(screen.getByRole('button', { name: 'Publish listing' }));

    await vi.waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith(getMarketplaceListingRoute('seller', 'boots_01'));
    });
    expect(restorePersistedMarketplaceSession).toHaveBeenCalledWith(sellerPubky);
    expect(screen.queryByRole('dialog', { name: 'Approve purchases' })).not.toBeInTheDocument();
  });

  it('opens reconnect when no persisted marketplace session exists', async () => {
    restorePersistedMarketplaceSession.mockReturnValue(null);
    const user = userEvent.setup();
    render(<MarketplaceSell />);

    await user.click(screen.getByRole('button', { name: 'Publish listing' }));

    expect(await screen.findByRole('dialog', { name: 'Approve purchases' })).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });
});
