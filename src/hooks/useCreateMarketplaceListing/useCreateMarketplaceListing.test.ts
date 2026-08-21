import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { commerceListingRecordSchema } from '@/libs/commerce/marketplace-records';
import { toast } from '@/molecules/Toaster/use-toast';
import { useCreateMarketplaceListing } from './useCreateMarketplaceListing';

const OWNER = 'y'.repeat(52);
const mediaState = vi.hoisted(() => ({
  prepared: true,
}));

const coverRecord = {
  id: 'image_01',
  type: 'image' as const,
  url: `pubky://${OWNER}/pub/pubky.app/marketplace/v1/media/image_01`,
  contentHash: 'a'.repeat(64),
  mimeType: 'image/jpeg',
  byteSize: 3,
  width: 1200,
  height: 1600,
  altText: 'Brown leather boots',
};

const secondRecord = {
  ...coverRecord,
  id: 'image_02',
  url: `pubky://${OWNER}/pub/pubky.app/marketplace/v1/media/image_02`,
  contentHash: 'b'.repeat(64),
  altText: 'Boot soles showing light wear',
};

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (store: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: OWNER }),
}));

vi.mock('@/hooks/useListingMediaManager/useListingMediaManager', () => ({
  useListingMediaManager: () => ({
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
    prepare: vi.fn(async () =>
      mediaState.prepared
        ? {
            ok: true,
            media: [coverRecord, secondRecord],
            uploads: [
              { record: coverRecord, bytes: new Uint8Array([1, 2, 3]) },
              { record: secondRecord, bytes: new Uint8Array([4, 5, 6]) },
            ],
          }
        : { ok: false, reason: 'no-photos' },
    ),
  }),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getListingDrafts: vi.fn(async () => []),
    commitUpdateListingDraft: vi.fn(),
    commitDeleteListingDraft: vi.fn(),
    commitCreateMedia: vi.fn(),
    commitUpsertListing: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

describe('useCreateMarketplaceListing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mediaState.prepared = true;
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('018f47d2-6a27-7c23-a49d-6b21bb770121');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uploads every prepared photo and publishes a schema-valid owner listing in media order', async () => {
    const { result } = renderHook(() => useCreateMarketplaceListing());
    act(() => {
      result.current.form.setValue('title', 'Vintage leather boots');
      result.current.form.setValue('description', 'Well cared for boots with light wear.');
      result.current.form.setValue('categoryId', 'fashion-men-footwear-boots');
      result.current.form.setValue('attrSize', 'US 9');
      result.current.form.setValue('price', '125.00');
      result.current.form.setValue('fulfillment', 'pickup');
      result.current.form.setValue('countryCode', 'US');
    });

    let createdId: string | null = null;
    await act(async () => {
      createdId = await result.current.submit();
    });

    expect(CommerceController.commitCreateMedia).toHaveBeenNthCalledWith(1, 'image_01', new Uint8Array([1, 2, 3]));
    expect(CommerceController.commitCreateMedia).toHaveBeenNthCalledWith(2, 'image_02', new Uint8Array([4, 5, 6]));
    expect(CommerceController.commitUpsertListing).toHaveBeenCalledOnce();
    const listing = vi.mocked(CommerceController.commitUpsertListing).mock.calls[0][0];
    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(true);
    expect(listing).toMatchObject({
      ownerPubky: OWNER,
      listingId: '018f47d26a277c23a49d6b21bb770121',
      title: 'Vintage leather boots',
      fulfillmentMethods: ['pickup'],
      sale: { format: 'fixed_price', unitPrice: { amountMinor: 12_500, currency: 'USD', exponent: 2 } },
      media: [{ id: 'image_01' }, { id: 'image_02' }],
      variants: [{ id: 'variant_1', quantity: 1, mediaIds: ['image_01', 'image_02'] }],
      taxonomyVersion: 2,
      categoryId: 'fashion-men-footwear-boots',
      attributes: { size: 'US 9' },
    });
    expect(createdId).toBe(`${OWNER}:018f47d26a277c23a49d6b21bb770121`);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Listing published' }));
  });

  it('publishes a bitcoin-priced listing as BTC money with exponent 8', async () => {
    const { result } = renderHook(() => useCreateMarketplaceListing());
    act(() => {
      result.current.form.setValue('title', 'Vintage leather boots');
      result.current.form.setValue('description', 'Well cared for boots with light wear.');
      result.current.form.setValue('categoryId', 'fashion-men-footwear-boots');
      result.current.form.setValue('attrSize', 'US 9');
      result.current.form.setValue('currency', 'BTC');
      result.current.form.setValue('price', '15000');
      result.current.form.setValue('fulfillment', 'pickup');
      result.current.form.setValue('countryCode', 'US');
    });

    await act(async () => {
      await result.current.submit();
    });

    const listing = vi.mocked(CommerceController.commitUpsertListing).mock.calls[0][0];
    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(true);
    expect(listing).toMatchObject({
      sale: { format: 'fixed_price', unitPrice: { amountMinor: 15_000, currency: 'BTC', exponent: 8 } },
    });
  });

  it('converts imperial package inputs to exact millimeters and grams on publish', async () => {
    const { result } = renderHook(() => useCreateMarketplaceListing());
    act(() => {
      result.current.form.setValue('title', 'Vintage leather boots');
      result.current.form.setValue('description', 'Well cared for boots with light wear.');
      result.current.form.setValue('categoryId', 'fashion-men-footwear-boots');
      result.current.form.setValue('attrSize', 'US 9');
      result.current.form.setValue('price', '125.00');
      result.current.form.setValue('shippingPrice', '12.00');
      result.current.form.setValue('packageWeight', '42.3');
      result.current.form.setValue('packageLength', '13.8');
      result.current.form.setValue('packageWidth', '9.8');
      result.current.form.setValue('packageHeight', '5.9');
      result.current.form.setValue('measurementSystem', 'imperial');
      result.current.form.setValue('countryCode', 'US');
    });

    await act(async () => {
      await result.current.submit();
    });

    const listing = vi.mocked(CommerceController.commitUpsertListing).mock.calls[0][0];
    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(true);
    expect(listing).toMatchObject({
      package: {
        weightGrams: 1_199, // 42.3 oz × 28.349523125
        lengthMillimeters: 351, // 13.8 in × 25.4
        widthMillimeters: 249, // 9.8 in × 25.4
        heightMillimeters: 150, // 5.9 in × 25.4
      },
    });
  });

  it('does not publish when media preparation fails', async () => {
    mediaState.prepared = false;
    const { result } = renderHook(() => useCreateMarketplaceListing());
    act(() => {
      result.current.form.setValue('title', 'Vintage leather boots');
      result.current.form.setValue('description', 'Well cared for boots with light wear.');
      result.current.form.setValue('categoryId', 'fashion-men-footwear-boots');
      result.current.form.setValue('attrSize', 'US 9');
      result.current.form.setValue('price', '125.00');
      result.current.form.setValue('fulfillment', 'pickup');
    });

    await act(() => result.current.submit());

    expect(CommerceController.commitCreateMedia).not.toHaveBeenCalled();
    expect(CommerceController.commitUpsertListing).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
  });

  it('autosaves draft form values after local hydration', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCreateMarketplaceListing());
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.form.setValue('title', 'Autosaved boots');
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(750);
    });

    expect(CommerceController.commitUpdateListingDraft).toHaveBeenCalledWith(
      '018f47d26a277c23a49d6b21bb770121',
      expect.objectContaining({ title: 'Autosaved boots' }),
    );
  });

  it('reports a restored draft and clears it on reset', async () => {
    vi.mocked(CommerceController.getListingDrafts).mockResolvedValue([
      {
        id: `${OWNER}:draftlisting01`,
        owner_id: OWNER,
        listing_id: 'draftlisting01',
        data: { ownerPubky: OWNER, listingId: 'draftlisting01', form: { title: 'Draft boots' } },
        created_at: 1_000,
        updated_at: 2_000,
      },
    ]);
    const { result } = renderHook(() => useCreateMarketplaceListing());
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.restoredDraft).toBe(true);
    expect(result.current.form.getValues('title')).toBe('Draft boots');

    act(() => result.current.reset());

    expect(result.current.restoredDraft).toBe(false);
    expect(result.current.form.getValues('title')).toBe('');
    expect(CommerceController.commitDeleteListingDraft).toHaveBeenCalledWith('draftlisting01');
  });

  it("migrates a legacy draft's 'SATS' currency to the canonical 'BTC' on restore", async () => {
    vi.mocked(CommerceController.getListingDrafts).mockResolvedValue([
      {
        id: `${OWNER}:draftlisting02`,
        owner_id: OWNER,
        listing_id: 'draftlisting02',
        data: {
          ownerPubky: OWNER,
          listingId: 'draftlisting02',
          form: { title: 'Legacy bitcoin draft', currency: 'SATS', price: '15000' },
        },
        created_at: 1_000,
        updated_at: 2_000,
      },
    ]);
    const { result } = renderHook(() => useCreateMarketplaceListing());
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.restoredDraft).toBe(true);
    expect(result.current.form.getValues('currency')).toBe('BTC');
    expect(result.current.form.getValues('price')).toBe('15000');
  });
});
