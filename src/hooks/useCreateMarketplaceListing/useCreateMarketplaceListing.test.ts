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

const mediaRecord = {
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

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (store: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: OWNER }),
}));

vi.mock('@/hooks/useListingMediaPicker/useListingMediaPicker', () => ({
  useListingMediaPicker: () => ({
    file: new File(['image'], 'boots.jpg', { type: 'image/jpeg' }),
    previewUrl: 'blob:boots',
    error: null,
    inputRef: { current: null },
    onInputChange: vi.fn(),
    choose: vi.fn(),
    remove: vi.fn(),
    reset: vi.fn(),
    prepare: vi.fn(async () =>
      mediaState.prepared ? { record: mediaRecord, bytes: new Uint8Array([1, 2, 3]) } : null,
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

  it('uploads prepared media and publishes a schema-valid owner listing', async () => {
    const { result } = renderHook(() => useCreateMarketplaceListing());
    act(() => {
      result.current.form.setValue('title', 'Vintage leather boots');
      result.current.form.setValue('description', 'Well cared for boots with light wear.');
      result.current.form.setValue('price', '125.00');
      result.current.form.setValue('quantity', '1');
      result.current.form.setValue('fulfillment', 'pickup');
      result.current.form.setValue('altText', 'Brown leather boots');
      result.current.form.setValue('countryCode', 'US');
    });

    let createdId: string | null = null;
    await act(async () => {
      createdId = await result.current.submit();
    });

    expect(CommerceController.commitCreateMedia).toHaveBeenCalledWith('image_01', new Uint8Array([1, 2, 3]));
    expect(CommerceController.commitUpsertListing).toHaveBeenCalledOnce();
    const listing = vi.mocked(CommerceController.commitUpsertListing).mock.calls[0][0];
    expect(commerceListingRecordSchema.safeParse(listing).success).toBe(true);
    expect(listing).toMatchObject({
      ownerPubky: OWNER,
      listingId: '018f47d26a277c23a49d6b21bb770121',
      title: 'Vintage leather boots',
      fulfillmentMethods: ['pickup'],
      sale: { format: 'fixed_price', unitPrice: { amountMinor: 12_500, currency: 'USD', exponent: 2 } },
    });
    expect(createdId).toBe(`${OWNER}:018f47d26a277c23a49d6b21bb770121`);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Listing published' }));
  });

  it('does not publish when media preparation fails', async () => {
    mediaState.prepared = false;
    const { result } = renderHook(() => useCreateMarketplaceListing());
    act(() => {
      result.current.form.setValue('title', 'Vintage leather boots');
      result.current.form.setValue('description', 'Well cared for boots with light wear.');
      result.current.form.setValue('price', '125.00');
      result.current.form.setValue('fulfillment', 'pickup');
      result.current.form.setValue('altText', 'Brown leather boots');
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
      vi.advanceTimersByTime(750);
    });

    expect(CommerceController.commitUpdateListingDraft).toHaveBeenCalledWith(
      '018f47d26a277c23a49d6b21bb770121',
      expect.objectContaining({ title: 'Autosaved boots' }),
    );
  });
});
