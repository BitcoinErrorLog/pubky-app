'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { sumMoneyByAsset } from '@/libs/commerce/pricing';
import type { CommerceListingModelSchema } from '@/models/commerce/commerce.schema';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';

export interface MarketplaceCartItem {
  id: string;
  listingId: string;
  variantId: string;
  quantity: number;
  listing: CommerceListingModelSchema;
}

export function useMarketplaceCart() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { requireAuth } = useRequireAuth();
  const items = useLiveQuery(async () => {
    if (!currentUserPubky) return [];
    const rows = await CommerceController.getCartItems();
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const separator = row.listing_id.indexOf(':');
        const listing = await CommerceController.getListing(
          row.listing_id.slice(0, separator),
          row.listing_id.slice(separator + 1),
        );
        return listing
          ? {
              id: row.id,
              listingId: row.listing_id,
              variantId: row.variant_id,
              quantity: row.quantity,
              listing: {
                id: listing.id,
                seller_id: listing.seller_id,
                listing_id: listing.listing_id,
                record: listing.record,
                revision: listing.revision,
                state: listing.state,
                category_id: listing.category_id,
                format: listing.format,
                currency: listing.currency,
                price_minor: listing.price_minor,
                sync_status: listing.sync_status,
                updated_at: listing.updated_at,
              },
            }
          : null;
      }),
    );
    return enriched.filter((item): item is MarketplaceCartItem => item !== null);
  }, [currentUserPubky]);

  const add = async (listingId: string, variantId: string, quantity = 1) => {
    const mutation = requireAuth(async () => {
      try {
        await CommerceController.commitUpsertCartItem(listingId, variantId, quantity);
        toast({ title: 'Added to cart' });
      } catch {
        toast({ variant: 'error', description: 'Could not add this item to the cart.' });
      }
    });
    await mutation;
  };

  const update = async (listingId: string, variantId: string, quantity: number) => {
    await CommerceController.commitUpsertCartItem(listingId, variantId, quantity);
  };

  const remove = async (listingId: string, variantId: string) => {
    await CommerceController.commitDeleteCartItem(listingId, variantId);
  };

  const clear = async () => {
    await CommerceController.commitClearCart();
  };

  // One subtotal per pricing asset: minor units of different assets (USD
  // cents, bitcoin base units) are never added into one false number.
  const subtotals = sumMoneyByAsset(
    (items ?? []).flatMap((item) => {
      const variant = item.listing.record.variants.find(({ id }) => id === item.variantId);
      const price =
        variant?.priceOverride ??
        (item.listing.record.sale.format === 'fixed_price' ? item.listing.record.sale.unitPrice : null);
      return price ? [{ money: price, quantity: item.quantity }] : [];
    }),
  );

  return {
    items: items ?? [],
    itemCount: (items ?? []).reduce((total, item) => total + item.quantity, 0),
    subtotals,
    isLoading: items === undefined,
    add,
    update,
    remove,
    clear,
  };
}
