import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceApplication } from '@/application/commerce/commerce';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import {
  COMMERCE_FIXTURE_BUYER,
  COMMERCE_FIXTURE_SELLER,
  createCommerceListingFixture,
  createCommerceShopFixture,
} from '@/test/fixtures/commerce/commerce';
import { CommerceController } from './commerce';

describe('CommerceController', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ currentUserPubky: COMMERCE_FIXTURE_SELLER });
    useCommerceStore.getState().reset();
  });

  it('maps catalog filters onto the server-side filters Nexus supports', async () => {
    const fetchCatalog = vi.spyOn(CommerceApplication, 'fetchCatalogListings').mockResolvedValue(undefined);

    await CommerceController.fetchCatalogListings({ saleFormat: 'auction', conditions: ['like_new'], sort: 'newest' });
    expect(fetchCatalog).toHaveBeenCalledWith({ saleFormat: 'auction', condition: 'like_new' });

    await CommerceController.fetchCatalogListings({ saleFormat: 'all', conditions: [], sort: 'recommended' });
    expect(fetchCatalog).toHaveBeenLastCalledWith({});
  });

  it('keeps multi-condition filtering client-side because Nexus accepts one condition', async () => {
    const fetchCatalog = vi.spyOn(CommerceApplication, 'fetchCatalogListings').mockResolvedValue(undefined);

    await CommerceController.fetchCatalogListings({ saleFormat: 'all', conditions: ['new', 'good'], sort: 'newest' });

    expect(fetchCatalog).toHaveBeenCalledWith({});
  });

  it('maps the ending-soon sort onto the auction end-time stream', async () => {
    const fetchCatalog = vi.spyOn(CommerceApplication, 'fetchCatalogListings').mockResolvedValue(undefined);

    await CommerceController.fetchCatalogListings({ saleFormat: 'all', conditions: [], sort: 'ending_soon' });

    expect(fetchCatalog).toHaveBeenCalledWith({ endingSoonest: true });
  });

  it('validates local listing lookup identity before calling application', async () => {
    const getListing = vi.spyOn(CommerceApplication, 'getListing').mockResolvedValue(null);

    await CommerceController.getListing(COMMERCE_FIXTURE_SELLER, 'boots_01');

    expect(getListing).toHaveBeenCalledWith(`${COMMERCE_FIXTURE_SELLER}:boots_01`);
    await expect(CommerceController.getListing('invalid', '../private')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(getListing).toHaveBeenCalledTimes(1);
  });

  it('marks a valid listing pending only while its application workflow runs', async () => {
    let finish: (() => void) | undefined;
    const workflow = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.spyOn(CommerceApplication, 'commitUpsertListing').mockReturnValue(workflow);
    const listing = createCommerceListingFixture();

    const commitment = CommerceController.commitUpsertListing(listing);
    expect(useCommerceStore.getState().pendingEntityIds).toEqual([`${COMMERCE_FIXTURE_SELLER}:boots_01`]);

    finish?.();
    await commitment;

    expect(useCommerceStore.getState().pendingEntityIds).toEqual([]);
  });

  it('rejects an owner mismatch before starting an application write', async () => {
    const commit = vi.spyOn(CommerceApplication, 'commitUpsertShop').mockResolvedValue(undefined);
    const shop = createCommerceShopFixture({ ownerPubky: COMMERCE_FIXTURE_BUYER });

    await expect(CommerceController.commitUpsertShop(shop)).rejects.toMatchObject({
      name: 'AppError',
      code: 'INVALID_INPUT',
      category: 'validation',
    });

    expect(commit).not.toHaveBeenCalled();
    expect(useCommerceStore.getState().pendingEntityIds).toEqual([]);
  });

  it('always clears pending UI state when publication fails', async () => {
    vi.spyOn(CommerceApplication, 'commitUpsertListing').mockRejectedValue(new TypeError('homeserver unavailable'));

    await expect(CommerceController.commitUpsertListing(createCommerceListingFixture())).rejects.toThrow(
      'homeserver unavailable',
    );

    expect(useCommerceStore.getState().pendingEntityIds).toEqual([]);
  });

  it('scopes favorite writes to the signed-in owner', async () => {
    const create = vi.spyOn(CommerceApplication, 'commitCreateFavorite').mockResolvedValue(undefined);
    const listingId = `${COMMERCE_FIXTURE_BUYER}:boots_01`;

    await CommerceController.commitCreateFavorite(listingId);

    expect(create).toHaveBeenCalledWith(COMMERCE_FIXTURE_SELLER, listingId);
    await expect(CommerceController.commitCreateFavorite('../invalid')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('prevents following the signed-in seller own shop', async () => {
    const create = vi.spyOn(CommerceApplication, 'commitCreateShopFollow').mockResolvedValue(undefined);

    await expect(CommerceController.commitCreateShopFollow(COMMERCE_FIXTURE_SELLER)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('validates and scopes marketplace media uploads', async () => {
    const upload = vi
      .spyOn(CommerceApplication, 'commitCreateMedia')
      .mockResolvedValue(`pubky://${COMMERCE_FIXTURE_SELLER}/pub/pubky.app/marketplace/v1/media/image_01`);
    const bytes = new Uint8Array([1, 2, 3]);

    await CommerceController.commitCreateMedia('image_01', bytes);

    expect(upload).toHaveBeenCalledWith(COMMERCE_FIXTURE_SELLER, 'image_01', bytes);
    await expect(CommerceController.commitCreateMedia('image_02', new Uint8Array())).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('validates and scopes local listing draft autosave data', async () => {
    const update = vi.spyOn(CommerceApplication, 'commitUpdateListingDraft').mockResolvedValue(undefined);

    await CommerceController.commitUpdateListingDraft('draft_01', { title: 'Autosaved boots', quantity: '1' });

    expect(update).toHaveBeenCalledWith(COMMERCE_FIXTURE_SELLER, 'draft_01', {
      title: 'Autosaved boots',
      quantity: '1',
    });
    await expect(CommerceController.commitUpdateListingDraft('draft_01', { invalid: BigInt(1) })).rejects.toMatchObject(
      {
        code: 'INVALID_INPUT',
      },
    );
  });

  it('validates and scopes sandbox transaction commands to the signed-in actor', async () => {
    const execute = vi.spyOn(CommerceApplication, 'executeMarketplaceCommand').mockResolvedValue({
      ok: false,
      error: { code: 'BID_TOO_LOW', message: 'Bid is too low.' },
    });
    const command = {
      version: 1,
      commandId: '00000000-0000-4000-8000-000000000820',
      aggregateId: `listing:${COMMERCE_FIXTURE_BUYER}_boots_01`,
      expectedRevision: 1,
      issuedAt: '2026-08-19T23:00:00.000Z',
      kind: 'auction.place_bid',
      payload: { maximumAmount: { amountMinor: 10_000, currency: 'USD', exponent: 2 } },
    };

    await CommerceController.executeMarketplaceCommand(command);

    expect(execute).toHaveBeenCalledWith(COMMERCE_FIXTURE_SELLER, command);
    await expect(
      CommerceController.executeMarketplaceCommand({ ...command, privateData: 'leak' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('validates private message attachments before gateway upload', async () => {
    const upload = vi.spyOn(CommerceApplication, 'uploadMarketplaceAttachment').mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000996',
      senderPubky: COMMERCE_FIXTURE_SELLER,
      recipientPubky: COMMERCE_FIXTURE_BUYER,
      mimeType: 'image/jpeg',
      byteSize: 5,
      contentHash: 'a'.repeat(64),
      createdAt: '2026-08-19T23:00:00.000Z',
    });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])], 'proof.jpg', { type: 'image/jpeg' });

    await CommerceController.uploadMarketplaceAttachment(COMMERCE_FIXTURE_BUYER, file);

    expect(upload).toHaveBeenCalledWith(COMMERCE_FIXTURE_SELLER, COMMERCE_FIXTURE_BUYER, file);
    await expect(
      CommerceController.uploadMarketplaceAttachment(
        COMMERCE_FIXTURE_BUYER,
        new File(['<svg/>'], 'unsafe.svg', { type: 'image/svg+xml' }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
