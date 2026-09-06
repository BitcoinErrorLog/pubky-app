import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommerceListingFixture, createCommerceShopFixture } from '@/test/fixtures/commerce/commerce';
import { toCommerceListingModel, toCommerceShopModel } from '@/test/fixtures/commerce/listing-models';
import { createListingProjectionFixture } from '@/test/fixtures/commerce/projections';
import { MarketplaceListing } from './MarketplaceListing';

const cartAdd = vi.hoisted(() => vi.fn());
const projectionRefresh = vi.hoisted(() => vi.fn());

const view = vi.hoisted(() => ({
  listing: null as ReturnType<typeof toCommerceListingModel> | null,
  shop: null as ReturnType<typeof toCommerceShopModel> | null,
  projection: null as ReturnType<typeof createListingProjectionFixture> | null,
  projectionError: null as string | null,
  needsSession: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/config/commerce', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/commerce')>();
  return { ...actual, getCommerceAdapterMode: () => 'transaction-service' };
});

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (querier: () => unknown) => querier(),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getListing: () => view.listing,
    getShop: () => view.shop,
    getOrFetchListing: () => Promise.resolve(null),
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'b'.repeat(52) }),
}));

vi.mock('@/hooks/useCommerceFavorite/useCommerceFavorite', () => ({
  useCommerceFavorite: () => ({ isFavorite: false, isMutating: false, toggle: vi.fn() }),
}));

vi.mock('@/hooks/useMarketplaceCart/useMarketplaceCart', () => ({
  useMarketplaceCart: () => ({
    items: [],
    itemCount: 0,
    subtotals: [],
    isLoading: false,
    add: cartAdd,
    update: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock('@/hooks/useMarketplaceProjection/useMarketplaceProjection', () => ({
  useMarketplaceProjection: () => ({
    projection: view.projection,
    isLoading: false,
    error: view.projectionError,
    needsSession: view.needsSession,
    refresh: projectionRefresh,
  }),
}));

vi.mock('@/hooks/useMeasurementSystem/useMeasurementSystem', () => ({
  useMeasurementSystem: () => 'metric',
}));

vi.mock('@/hooks/useIndicativeBtcRate/useIndicativeBtcRate', () => ({
  useIndicativeBtcRate: () => null,
}));

vi.mock('@/libs/commerce/media-url', () => ({
  resolveMarketplaceMediaUrl: () => null,
  resolveFirstMarketplaceMediaUrl: () => null,
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/organisms/Marketplace/MarketplaceCommunityTags', () => ({
  MarketplaceCommunityTags: () => null,
}));

vi.mock('@/organisms/Marketplace/MarketplaceListingSavePicker', () => ({
  MarketplaceListingSavePicker: () => null,
}));

vi.mock('@/organisms/Marketplace/MarketplaceMessageDialog', () => ({
  MarketplaceMessageDialog: () => <button type="button">Message seller</button>,
}));

vi.mock('@/organisms/Marketplace/MarketplaceReputationHeader', () => ({
  MarketplaceReputationHeader: () => null,
}));

vi.mock('@/organisms/Marketplace/MarketplaceReviewsSection', () => ({
  MarketplaceReviewsSection: () => <section aria-label="Reviews" />,
}));

describe('MarketplaceListing', () => {
  beforeEach(() => {
    view.listing = toCommerceListingModel(createCommerceListingFixture());
    view.shop = toCommerceShopModel(createCommerceShopFixture());
    view.projection = createListingProjectionFixture();
    view.projectionError = null;
    view.needsSession = false;
    cartAdd.mockClear();
    projectionRefresh.mockClear();
  });

  const renderListing = () => {
    const listing = view.listing;
    if (!listing) throw new Error('Expected listing fixture');
    render(<MarketplaceListing sellerPubky={listing.seller_id} listingId={listing.listing_id} />);
    return listing;
  };

  it('does not show the approval card just for viewing a listing without a marketplace session', () => {
    view.projection = null;
    view.projectionError = 'A marketplace session is required.';
    view.needsSession = true;

    renderListing();

    expect(screen.getByRole('heading', { name: 'Vintage leather boots' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Message seller' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Reviews' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve in Pubky Ring' })).not.toBeInTheDocument();
  });

  it('reveals the approval card after Add to cart is clicked without a marketplace session', async () => {
    view.projection = null;
    view.projectionError = 'A marketplace session is required.';
    view.needsSession = true;
    const user = userEvent.setup();

    renderListing();
    await user.click(screen.getByRole('button', { name: 'Add to cart' }));

    expect(cartAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Approve purchases in Pubky Ring' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve in Pubky Ring' })).toBeInTheDocument();
  });

  it('adds the selected variant to cart when the marketplace session is ready', async () => {
    const user = userEvent.setup();

    const listing = renderListing();
    await user.click(screen.getByRole('button', { name: 'Add to cart' }));

    expect(cartAdd).toHaveBeenCalledWith(`${listing.seller_id}:${listing.listing_id}`, 'variant_01', 1);
    expect(screen.queryByRole('button', { name: 'Approve in Pubky Ring' })).not.toBeInTheDocument();
  });
});
