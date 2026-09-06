'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceOffers } from '@/hooks/useMarketplaceOffers/useMarketplaceOffers';
import { useMarketplaceOrders } from '@/hooks/useMarketplaceOrders/useMarketplaceOrders';
import { sumMoneyByAsset } from '@/libs/commerce/pricing';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';

export function useMarketplaceSellerDashboard() {
  const [nowMs, setNowMs] = useState(0);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const localListings = useLiveQuery(
    () => (currentUserPubky ? CommerceController.getListingsBySeller(currentUserPubky) : []),
    [currentUserPubky],
  );
  const orders = useMarketplaceOrders();
  const offers = useMarketplaceOffers();
  const sellerOrders = orders.orders.filter(({ order }) => order.sellerPubky === currentUserPubky);
  const sellerOffers = offers.offers.filter(({ sellerPubky }) => sellerPubky === currentUserPubky);
  const activeListings = (localListings ?? []).filter(({ state }) => state === 'active');
  const expiringBefore = nowMs + 24 * 60 * 60 * 1_000;
  const expiringAuctions = activeListings.filter((listing) => {
    if (listing.record.sale.format !== 'auction') return false;
    const endsAt = Date.parse(listing.record.sale.endsAt);
    return endsAt > nowMs && endsAt <= expiringBefore;
  }).length;
  const ordersToShip = sellerOrders.filter(({ order }) => order.state === 'paid').length;
  const offersAwaitingReply = sellerOffers.filter(
    ({ state, offeredBy }) => (state === 'pending' || state === 'countered') && offeredBy !== currentUserPubky,
  ).length;
  const totalInventory = activeListings.reduce(
    (total, listing) => total + listing.record.variants.reduce((sum, variant) => sum + variant.quantity, 0),
    0,
  );
  // One revenue figure per pricing asset: minor units of different assets
  // (USD cents, bitcoin base units) are never summed into one false number.
  const revenue = sumMoneyByAsset(
    sellerOrders
      .filter(({ order }) => ['paid', 'processing', 'shipped', 'delivered', 'completed'].includes(order.state))
      .map(({ order }) => ({ money: order.total, quantity: 1 })),
  );

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

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return {
    listings: localListings ?? [],
    sellerOrders,
    offers: sellerOffers,
    isLoading: localListings === undefined || orders.isLoading || offers.isLoading,
    // Orders and offers ride the same durable session, so either flag means
    // the dashboard's remote-backed numbers are missing until reconnect.
    needsSession: orders.needsSession || offers.needsSession,
    sessionError: (orders.needsSession ? orders.error : null) ?? (offers.needsSession ? offers.error : null),
    metrics: {
      activeListings: activeListings.length,
      totalInventory,
      lowStock: activeListings.filter((listing) =>
        listing.record.variants.some((variant) => variant.enabled && variant.quantity <= 1),
      ).length,
      paidOrders: sellerOrders.filter(({ order }) => order.state !== 'pending_payment').length,
      revenue,
      openOffers: sellerOffers.filter(({ state }) => state === 'pending' || state === 'countered').length,
    },
    actionNeeded: {
      ordersToShip,
      offersAwaitingReply,
      expiringAuctions,
      total: ordersToShip + offersAwaitingReply + expiringAuctions,
    },
    updateListingState,
    exportCsv,
  };
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""').replace(/^[=+\-@]/, "'$&")}"`;
}
