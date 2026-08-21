import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { MarketplaceCartItem } from '@/hooks/useMarketplaceCart/useMarketplaceCart';
import { createCommerceSandboxCatalog } from '@/libs/commerce/sandbox-catalog';
import { useMarketplaceCheckout } from './useMarketplaceCheckout';

const listing = createCommerceSandboxCatalog().listings.find(({ sale }) => sale.format === 'fixed_price')!;
const price = listing.sale.format === 'fixed_price' ? listing.sale.unitPrice : listing.sale.startingPrice;
const item: MarketplaceCartItem = {
  id: 'cart-item',
  listingId: `${listing.ownerPubky}:${listing.listingId}`,
  variantId: listing.variants[0].id,
  quantity: 1,
  listing: {
    id: `${listing.ownerPubky}:${listing.listingId}`,
    seller_id: listing.ownerPubky,
    listing_id: listing.listingId,
    record: listing,
    revision: 1,
    state: 'active',
    category_id: listing.categoryId,
    format: listing.sale.format,
    currency: price.currency,
    price_minor: price.amountMinor,
    sync_status: 'synced',
    updated_at: Date.parse(listing.updatedAt),
  },
};

const config = vi.hoisted(() => ({
  mode: 'sandbox' as string,
}));

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommerceAdapterMode: () => config.mode };
});

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getMarketplaceListingProjection: vi.fn(),
    syncListingRegistration: vi.fn(),
    executeMarketplaceCommand: vi.fn(),
    getDeliveryAddresses: vi.fn(async () => []),
    commitUpsertDeliveryAddress: vi.fn(async () => {}),
    commitMarkDeliveryAddressUsed: vi.fn(async () => {}),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

const authMock = vi.hoisted(() => ({ currentUserPubky: null as string | null }));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: authMock.currentUserPubky }),
}));

const BUYER = 'b'.repeat(52);

const savedAddress = {
  id: `${BUYER}:addr1`,
  owner_id: BUYER,
  label: 'Home',
  name: 'Alice Buyer',
  line1: '1 Market Street',
  line2: '',
  city: 'New York',
  region: 'NY',
  postal_code: '10001',
  country_code: 'US',
  is_default: true,
  last_used_at: null,
  created_at: 100,
  updated_at: 100,
};

describe('useMarketplaceCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.mode = 'sandbox';
    authMock.currentUserPubky = null;
    vi.mocked(CommerceController.getDeliveryAddresses).mockResolvedValue([]);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000001100');
    vi.mocked(CommerceController.getMarketplaceListingProjection).mockResolvedValue({
      aggregateId: `listing:${listing.ownerPubky}_${listing.listingId}`,
      sellerPubky: listing.ownerPubky,
      listingId: listing.listingId,
      serverRevision: 1,
      state: 'available',
      availableQuantity: 1,
      reservedQuantity: 0,
      unitPrice: price,
      saleFormat: 'fixed_price',
      auction: null,
    });
    vi.mocked(CommerceController.executeMarketplaceCommand).mockResolvedValue({
      ok: true,
      version: 1,
      commandId: '00000000-0000-4000-8000-000000001100',
      aggregateId: 'checkout:00000000-0000-4000-8000-000000001100',
      revision: 1,
      eventIds: ['00000000-0000-4000-8000-000000001101'],
      result: { kind: 'checkout' },
    });
  });

  it('refreshes terms and creates a guarantee-versioned checkout', async () => {
    const clear = vi.fn(async () => {});
    const { result } = renderHook(() => useMarketplaceCheckout([item], clear));
    act(() => {
      result.current.form.setValue('name', 'Alice Buyer');
      result.current.form.setValue('line1', '1 Market Street');
      result.current.form.setValue('city', 'New York');
      result.current.form.setValue('region', 'NY');
      result.current.form.setValue('postalCode', '10001');
    });

    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.submit();
    });

    expect(succeeded).toBe(true);
    expect(CommerceController.executeMarketplaceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: 'checkout:00000000-0000-4000-8000-000000001100',
        kind: 'checkout.create',
        payload: expect.objectContaining({
          lines: [
            {
              listingAggregateId: `listing:${listing.ownerPubky}_${listing.listingId}`,
              expectedRevision: 1,
              quantity: 1,
              // The chosen variant rides the line as a display snapshot: the
              // id plus its option dimensions as an ordered {name, value}
              // array (safe through the wire-casing layer).
              variantId: listing.variants[0].id,
              ...(Object.keys(listing.variants[0].options).length
                ? {
                    variantOptions: Object.entries(listing.variants[0].options).map(([name, value]) => ({
                      name,
                      value,
                    })),
                  }
                : {}),
            },
          ],
          guaranteePolicyVersion: 1,
        }),
      }),
    );
    expect(clear).toHaveBeenCalled();
  });

  it('heals an unregistered cart line with one sync before checking out', async () => {
    config.mode = 'transaction-service';
    const registered = {
      aggregateId: `listing:${listing.ownerPubky}_${listing.listingId}`,
      serverRevision: 1,
    };
    vi.mocked(CommerceController.getMarketplaceListingProjection)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(registered as never);
    vi.mocked(CommerceController.syncListingRegistration).mockResolvedValue({ ok: true, revision: 1 } as never);
    const clear = vi.fn(async () => {});
    const { result } = renderHook(() => useMarketplaceCheckout([item], clear));
    act(() => {
      result.current.form.setValue('name', 'Alice Buyer');
      result.current.form.setValue('line1', '1 Market Street');
      result.current.form.setValue('city', 'New York');
      result.current.form.setValue('region', 'NY');
      result.current.form.setValue('postalCode', '10001');
    });

    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.submit();
    });

    expect(succeeded).toBe(true);
    expect(CommerceController.syncListingRegistration).toHaveBeenCalledTimes(1);
    expect(CommerceController.syncListingRegistration).toHaveBeenCalledWith(listing.ownerPubky, listing.listingId);
    expect(CommerceController.executeMarketplaceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'checkout.create',
        payload: expect.objectContaining({
          lines: [expect.objectContaining({ listingAggregateId: registered.aggregateId, expectedRevision: 1 })],
        }),
      }),
    );
  });

  it('fails honestly when the line sync also cannot register the listing', async () => {
    config.mode = 'transaction-service';
    vi.mocked(CommerceController.getMarketplaceListingProjection).mockResolvedValue(null);
    vi.mocked(CommerceController.syncListingRegistration).mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: "The seller's homeserver has no such listing record." },
    } as never);
    const clear = vi.fn(async () => {});
    const { result } = renderHook(() => useMarketplaceCheckout([item], clear));
    act(() => {
      result.current.form.setValue('name', 'Alice Buyer');
      result.current.form.setValue('line1', '1 Market Street');
      result.current.form.setValue('city', 'New York');
      result.current.form.setValue('region', 'NY');
      result.current.form.setValue('postalCode', '10001');
    });

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.submit();
    });

    expect(succeeded).toBe(false);
    expect(CommerceController.syncListingRegistration).toHaveBeenCalledTimes(1);
    expect(CommerceController.executeMarketplaceCommand).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    const { toast } = await import('@/molecules/Toaster/use-toast');
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('could not be prepared for checkout') }),
    );
  });

  it('keeps the cart and asks for a retry when a listing revision conflicts mid-checkout', async () => {
    vi.mocked(CommerceController.executeMarketplaceCommand).mockResolvedValue({
      ok: false,
      error: { code: 'REVISION_CONFLICT', message: 'The aggregate changed.', currentRevision: 2 },
    });
    const clear = vi.fn(async () => {});
    const { result } = renderHook(() => useMarketplaceCheckout([item], clear));
    act(() => {
      result.current.form.setValue('name', 'Alice Buyer');
      result.current.form.setValue('line1', '1 Market Street');
      result.current.form.setValue('city', 'New York');
      result.current.form.setValue('region', 'NY');
      result.current.form.setValue('postalCode', '10001');
    });

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.submit();
    });

    expect(succeeded).toBe(false);
    expect(clear).not.toHaveBeenCalled();
    const { toast } = await import('@/molecules/Toaster/use-toast');
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('place the order again') }),
    );
  });

  it('prefills from the top saved address and marks it used after a successful order', async () => {
    authMock.currentUserPubky = BUYER;
    vi.mocked(CommerceController.getDeliveryAddresses).mockResolvedValue([savedAddress]);
    const clear = vi.fn(async () => {});
    const { result } = renderHook(() => useMarketplaceCheckout([item], clear));

    await vi.waitFor(() => {
      if (result.current.selectedAddressId !== savedAddress.id) throw new Error('Address has not been applied yet.');
    });
    expect(result.current.addresses).toEqual([savedAddress]);
    expect(result.current.form.getValues('line1')).toBe('1 Market Street');

    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.submit();
    });

    expect(succeeded).toBe(true);
    expect(CommerceController.executeMarketplaceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          deliveryAddress: {
            name: 'Alice Buyer',
            line1: '1 Market Street',
            line2: '',
            city: 'New York',
            region: 'NY',
            postalCode: '10001',
            countryCode: 'US',
          },
        }),
      }),
    );
    expect(CommerceController.commitMarkDeliveryAddressUsed).toHaveBeenCalledWith('addr1');
    expect(CommerceController.commitUpsertDeliveryAddress).not.toHaveBeenCalled();
  });

  it('saves a new labeled address after ordering when the buyer opted in', async () => {
    authMock.currentUserPubky = BUYER;
    const clear = vi.fn(async () => {});
    const { result } = renderHook(() => useMarketplaceCheckout([item], clear));
    act(() => {
      result.current.form.setValue('name', 'Alice Buyer');
      result.current.form.setValue('line1', '1 Market Street');
      result.current.form.setValue('city', 'New York');
      result.current.form.setValue('region', 'NY');
      result.current.form.setValue('postalCode', '10001');
      result.current.form.setValue('saveAddress', true);
      result.current.form.setValue('saveLabel', 'Home');
    });

    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.submit();
    });

    expect(succeeded).toBe(true);
    expect(CommerceController.commitUpsertDeliveryAddress).toHaveBeenCalledWith(expect.any(String), {
      label: 'Home',
      name: 'Alice Buyer',
      line1: '1 Market Street',
      line2: '',
      city: 'New York',
      region: 'NY',
      postalCode: '10001',
      countryCode: 'US',
    });
    expect(CommerceController.commitMarkDeliveryAddressUsed).toHaveBeenCalled();
  });

  it('drops the picker selection when the buyer edits a picked address', async () => {
    authMock.currentUserPubky = BUYER;
    vi.mocked(CommerceController.getDeliveryAddresses).mockResolvedValue([savedAddress]);
    const { result } = renderHook(() =>
      useMarketplaceCheckout(
        [item],
        vi.fn(async () => {}),
      ),
    );
    await vi.waitFor(() => {
      if (result.current.selectedAddressId !== savedAddress.id) throw new Error('Address has not been applied yet.');
    });

    act(() => {
      result.current.form.setValue('line1', '99 Elsewhere Avenue');
    });

    await vi.waitFor(() => {
      if (result.current.selectedAddressId !== null) throw new Error('Selection has not been dropped yet.');
    });

    // Re-picking restores the saved values.
    act(() => {
      result.current.selectAddress(savedAddress.id);
    });
    expect(result.current.form.getValues('line1')).toBe('1 Market Street');
    expect(result.current.selectedAddressId).toBe(savedAddress.id);
  });
});
