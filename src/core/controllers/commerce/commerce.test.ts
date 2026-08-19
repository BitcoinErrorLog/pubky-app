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
});
