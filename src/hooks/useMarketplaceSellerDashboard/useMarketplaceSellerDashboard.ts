'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceOffers } from '@/hooks/useMarketplaceOffers/useMarketplaceOffers';
import { useMarketplaceOrders } from '@/hooks/useMarketplaceOrders/useMarketplaceOrders';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';

export function useMarketplaceSellerDashboard() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const localListings = useLiveQuery(
    () => (currentUserPubky ? CommerceController.getListingsBySeller(currentUserPubky) : []),
    [currentUserPubky],
  );
  const orders = useMarketplaceOrders();
  const offers = useMarketplaceOffers();
  const sellerOrders = orders.orders.filter(({ order }) => order.sellerPubky === currentUserPubky);
  const activeListings = (localListings ?? []).filter(({ state }) => state === 'active');
  const totalInventory = activeListings.reduce(
    (total, listing) => total + listing.record.variants.reduce((sum, variant) => sum + variant.quantity, 0),
    0,
  );
  const revenueMinor = sellerOrders
    .filter(({ order }) => ['paid', 'processing', 'shipped', 'delivered', 'completed'].includes(order.state))
    .reduce((total, { order }) => total + order.total.amountMinor, 0);

  const updateListingState = async (listingIds: string[], state: 'active' | 'paused') => {
    const selected = (localListings ?? []).filter(({ id }) => listingIds.includes(id));
    try {
      await Promise.all(
        selected.map(({ record }) =>
          CommerceController.commitUpsertListing({
            ...record,
            revision: record.revision + 1,
            state,
            updatedAt: new Date().toISOString(),
          }),
        ),
      );
      toast({ title: state === 'active' ? 'Listings activated' : 'Listings paused' });
      return true;
    } catch {
      toast({ variant: 'error', description: 'Could not update selected listings.' });
      return false;
    }
  };

  const exportCsv = (): string => {
    const header = ['listing_id', 'title', 'state', 'format', 'price_minor', 'currency', 'inventory'];
    const rows = (localListings ?? []).map((listing) => [
      csvCell(listing.listing_id),
      csvCell(listing.record.title),
      listing.state,
      listing.format,
      String(listing.price_minor),
      listing.currency,
      String(listing.record.variants.reduce((total, variant) => total + variant.quantity, 0)),
    ]);
    return [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
  };

  return {
    listings: localListings ?? [],
    sellerOrders,
    offers: offers.offers.filter(({ sellerPubky }) => sellerPubky === currentUserPubky),
    isLoading: localListings === undefined || orders.isLoading || offers.isLoading,
    metrics: {
      activeListings: activeListings.length,
      totalInventory,
      lowStock: activeListings.filter((listing) =>
        listing.record.variants.some((variant) => variant.enabled && variant.quantity <= 1),
      ).length,
      paidOrders: sellerOrders.filter(({ order }) => order.state !== 'pending_payment').length,
      revenueMinor,
      openOffers: offers.offers.filter(
        ({ sellerPubky, state }) => sellerPubky === currentUserPubky && (state === 'pending' || state === 'countered'),
      ).length,
    },
    updateListingState,
    exportCsv,
  };
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""').replace(/^[=+\-@]/, "'$&")}"`;
}
