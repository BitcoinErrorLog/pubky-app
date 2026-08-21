import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { commerceListingRecordSchema } from '@/libs/commerce/marketplace-records';
import { useEditMarketplaceListing } from './useEditMarketplaceListing';

const OWNER = 'y'.repeat(52);
const OTHER = 'z'.repeat(52);
const LISTING_ID = 'listing01';

const existingMedia = {
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

const publishedRecord = {
  schemaVersion: 1 as const,
  recordType: 'listing' as const,
  ownerPubky: OWNER,
  revision: 2,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T10:00:00.000Z',
  listingId: LISTING_ID,
  state: 'active' as const,
  title: 'Vintage leather boots',
  description: 'Well cared for boots with light wear.',
  taxonomyVersion: 1 as const,
  categoryId: 'fashion',
  condition: 'good' as const,
  tags: ['vintage', 'leather', 'boots'],
  location: { countryCode: 'US', region: 'NY' },
  media: [existingMedia],
  variants: [
    {
      id: 'variant_1',
      options: { size: '42' },
      quantity: 3,
      mediaIds: ['image_01'],
      enabled: true,
    },
  ],
  sale: {
    format: 'fixed_price' as const,
    unitPrice: { amountMinor: 12_500, currency: 'USD', exponent: 2 },
    acceptsOffers: true,
  },
  fulfillmentMethods: ['pickup' as const],
  shippingOptions: [],
  returnPolicy: { acceptsReturns: true, returnWindowDays: 30, buyerPaysReturnShipping: true },
  adultOnly: false,
};

const authState = vi.hoisted(() => ({ currentUserPubky: 'y'.repeat(52) }));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (store: { currentUserPubky: string }) => unknown) => selector(authState),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getOrFetchListing: vi.fn(),
    commitCreateMedia: vi.fn(),
    commitUpsertListing: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

describe('useEditMarketplaceListing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUserPubky = OWNER;
    vi.mocked(CommerceController.getOrFetchListing).mockResolvedValue(structuredClone(publishedRecord));
  });

  it('hydrates the form and photos from the published record', async () => {
    const { result } = renderHook(() => useEditMarketplaceListing(OWNER, LISTING_ID));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.form.getValues()).toMatchObject({
      title: 'Vintage leather boots',
      price: '125.00',
      fulfillment: 'pickup',
      returnDays: '30',
      variants: [{ size: '42', quantity: '3' }],
    });
    expect(result.current.media.items).toEqual([
      expect.objectContaining({ kind: 'existing', key: 'image_01', altText: 'Brown leather boots' }),
    ]);
    expect(result.current.saleTermsLocked).toBe(false);
  });

  it('republishes the same listing with a bumped revision and reused media', async () => {
    const { result } = renderHook(() => useEditMarketplaceListing(OWNER, LISTING_ID));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.form.setValue('title', 'Vintage leather boots — resoled');
      result.current.form.setValue('price', '150.00');
    });

    let savedId: string | null = null;
    await act(async () => {
      savedId = await result.current.submit();
    });

    expect(savedId).toBe(`${OWNER}:${LISTING_ID}`);
    // No new photos were added, so nothing re-uploads.
    expect(CommerceController.commitCreateMedia).not.toHaveBeenCalled();
    const updated = vi.mocked(CommerceController.commitUpsertListing).mock.calls[0][0];
    expect(commerceListingRecordSchema.safeParse(updated).success).toBe(true);
    expect(updated).toMatchObject({
      ownerPubky: OWNER,
      listingId: LISTING_ID,
      revision: 3,
      createdAt: publishedRecord.createdAt,
      state: 'active',
      title: 'Vintage leather boots — resoled',
      sale: { format: 'fixed_price', unitPrice: { amountMinor: 15_000 }, acceptsOffers: true },
      media: [{ id: 'image_01' }],
    });
  });

  it('hydrates structured attributes into the form and preserves foreign attributes verbatim', async () => {
    const recordWithAttributes = {
      ...structuredClone(publishedRecord),
      taxonomyVersion: 2,
      categoryId: 'fashion-men-tops-hoodies',
      attributes: {
        size: 'L',
        brand: 'Champion',
        color: ['grey', 'navy'],
        // A vocabulary value this build does not know: not form-manageable.
        source: 'estate-sale',
        // A key this build's taxonomy does not define at all.
        'graded-by': 'PSA 9',
      },
    };
    vi.mocked(CommerceController.getOrFetchListing).mockResolvedValue(recordWithAttributes);

    const { result } = renderHook(() => useEditMarketplaceListing(OWNER, LISTING_ID));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.form.getValues()).toMatchObject({
      categoryId: 'fashion-men-tops-hoodies',
      attrSize: 'L',
      attrBrand: 'Champion',
      attrColors: ['grey', 'navy'],
      // The foreign source value stays out of the form (it would fail the
      // vocabulary validation) — it is preserved outside it instead.
      attrSource: '',
    });

    act(() => {
      result.current.form.setValue('title', 'Heavyweight varsity fleece — washed');
      result.current.form.setValue('attrSize', 'XL');
    });

    await act(async () => {
      await result.current.submit();
    });

    const updated = vi.mocked(CommerceController.commitUpsertListing).mock.calls[0][0];
    expect(commerceListingRecordSchema.safeParse(updated).success).toBe(true);
    expect(updated).toMatchObject({
      revision: 3,
      attributes: {
        size: 'XL',
        brand: 'Champion',
        color: ['grey', 'navy'],
        source: 'estate-sale',
        'graded-by': 'PSA 9',
      },
    });
  });

  it('preserves auction sale terms verbatim when editing an auction', async () => {
    const auctionRecord = {
      ...structuredClone(publishedRecord),
      sale: {
        format: 'auction' as const,
        startingPrice: { amountMinor: 12_500, currency: 'USD', exponent: 2 },
        minimumIncrement: { amountMinor: 625, currency: 'USD', exponent: 2 },
        startsAt: '2026-08-01T10:00:00.000Z',
        endsAt: '2026-08-08T10:00:00.000Z',
        antiSnipingWindowSeconds: 120,
        antiSnipingExtensionSeconds: 120,
      },
    };
    vi.mocked(CommerceController.getOrFetchListing).mockResolvedValue(auctionRecord);

    const { result } = renderHook(() => useEditMarketplaceListing(OWNER, LISTING_ID));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.saleTermsLocked).toBe(true);

    act(() => {
      result.current.form.setValue('description', 'Updated description with more provenance detail.');
      // A hostile or accidental price change must not alter published terms.
      result.current.form.setValue('price', '999.00');
    });

    await act(async () => {
      await result.current.submit();
    });

    const updated = vi.mocked(CommerceController.commitUpsertListing).mock.calls[0][0];
    expect(updated).toMatchObject({ revision: 3, sale: auctionRecord.sale });
  });

  it('refuses to edit another seller’s listing', async () => {
    authState.currentUserPubky = OTHER;
    const { result } = renderHook(() => useEditMarketplaceListing(OWNER, LISTING_ID));

    await waitFor(() => expect(result.current.status).toBe('not-owner'));
    expect(CommerceController.getOrFetchListing).not.toHaveBeenCalled();
  });

  it('refuses digital-delivery listings the studio cannot author', async () => {
    vi.mocked(CommerceController.getOrFetchListing).mockResolvedValue({
      ...structuredClone(publishedRecord),
      fulfillmentMethods: ['digital' as const],
      digitalLock: {
        policyUri: `pubky://${OWNER}/pub/locks.app/policy.json`,
        criterionId: 'criterion-1',
        contentPath: 'content/file.bin',
        resourceHash: 'b'.repeat(64),
        minimumConfirmations: 1,
      },
    });

    const { result } = renderHook(() => useEditMarketplaceListing(OWNER, LISTING_ID));
    await waitFor(() => expect(result.current.status).toBe('unsupported'));
  });

  it('reports not-found when the record cannot be loaded', async () => {
    vi.mocked(CommerceController.getOrFetchListing).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useEditMarketplaceListing(OWNER, LISTING_ID));

    await waitFor(() => expect(result.current.status).toBe('not-found'));
  });
});
