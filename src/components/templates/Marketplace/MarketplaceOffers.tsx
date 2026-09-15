'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, HandCoins } from 'lucide-react';
import { APP_ROUTES, getMarketplaceListingRoute, MARKETPLACE_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useMarketplaceCart } from '@/hooks/useMarketplaceCart/useMarketplaceCart';
import { useMarketplaceFirstMediaUrl } from '@/hooks/useMarketplaceMediaUrl/useMarketplaceMediaUrl';
import { useMarketplaceOffers } from '@/hooks/useMarketplaceOffers/useMarketplaceOffers';
import { formatCommerceMoney } from '@/libs/commerce/format';
import type { CommerceListingRecord } from '@/libs/commerce/marketplace-records';
import { amountInputUnitLabel, isBitcoinAsset } from '@/libs/commerce/pricing';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceSectionNav } from '@/organisms/Marketplace/MarketplaceSectionNav';
import { MarketplaceSessionRequiredCard } from '@/organisms/Marketplace/MarketplaceSessionRequiredCard';
import type { MarketplaceOffer } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';

export function MarketplaceOffers() {
  const router = useRouter();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const offers = useMarketplaceOffers();
  const cart = useMarketplaceCart();
  const [countering, setCountering] = useState<MarketplaceOffer | null>(null);
  const { listings, isHydrating } = useOfferListings(offers.offers);
  const linkedOfferId = useOfferAnchor();
  const linkedOfferMissing = isLinkedOfferMissing(linkedOfferId, offers.offers, offers.isLoading, offers.error);

  const submitCounter = async () => {
    if (!countering || !(await offers.counter(countering))) return;
    setCountering(null);
  };

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28"
      classNameWrapperContent="max-w-4xl"
    >
      <Container overrideDefaults className="flex w-full flex-col gap-6 px-4 sm:px-6">
        <MarketplaceSectionNav />
        <Link
          href={APP_ROUTES.MARKETPLACE}
          overrideDefaults
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          Marketplace
        </Link>
        <div>
          <Heading level={1} size="xl" className="text-4xl sm:text-6xl">
            Offers
          </Heading>
          <Typography as="p" className="mt-2 text-muted-foreground">
            Private, expiring terms with immutable counteroffer history.
          </Typography>
        </div>

        {offers.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : offers.needsSession && offers.error ? (
          <MarketplaceSessionRequiredCard />
        ) : offers.error ? (
          <div role="alert" className="rounded-xl border border-destructive/40 p-4">
            {offers.error}
          </div>
        ) : linkedOfferMissing ? (
          <Typography as="p" role="status" className="rounded-xl border border-dashed p-4 text-muted-foreground">
            This offer is no longer available.
          </Typography>
        ) : offers.offers.length ? (
          <div className="grid gap-4">
            {offers.offers.map((offer) => {
              const actionable = offer.state === 'pending' || offer.state === 'countered';
              const incoming = offer.offeredBy !== currentUserPubky;
              return (
                <Card key={offer.id} id={`offer-${offer.id}`} className="border py-5">
                  <CardContent className="grid gap-4 px-5 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge>{incoming ? 'Incoming' : 'Sent'}</Badge>
                        <Badge variant="secondary">{offerStateLabel(offer.state, offer.expiresAt)}</Badge>
                      </div>
                      <Typography as="p" className="text-2xl font-bold text-brand">
                        {formatCommerceMoney(offer.amount)}
                      </Typography>
                      <OfferListingSummary
                        offer={offer}
                        listing={listings.get(listingCompositeId(offer))}
                        isHydrating={isHydrating}
                      />
                      <Typography as="p" className="text-sm text-muted-foreground">
                        Quantity {offer.quantity} · Expires {new Date(offer.expiresAt).toLocaleString('en-US')}
                      </Typography>
                      {offer.award && offer.state === 'accepted' && offer.buyerPubky === currentUserPubky && (
                        <Typography as="p" className="mt-2 text-sm text-brand">
                          Accepted offer · {formatCommerceMoney(offer.award.unitPrice)} each · Quantity{' '}
                          {offer.award.quantity} · Buy by {new Date(offer.award.convertBy).toLocaleString('en-US')}
                        </Typography>
                      )}
                      {offer.state === 'accepted' &&
                        offer.buyerPubky === currentUserPubky &&
                        (!offer.award || offer.award.state !== 'active') && (
                          <Typography as="p" className="mt-2 text-sm text-muted-foreground">
                            Checkout for this offer is unavailable.
                          </Typography>
                        )}
                      {offer.message && (
                        <Typography as="p" className="mt-2 text-sm">
                          “{offer.message}”
                        </Typography>
                      )}
                    </div>
                    {offer.award &&
                    offer.award.state === 'active' &&
                    offer.state === 'accepted' &&
                    offer.buyerPubky === currentUserPubky ? (
                      <div className="flex flex-col items-start gap-2">
                        <Button
                          size="sm"
                          className="rounded-full"
                          onClick={async () => {
                            const award = offer.award;
                            if (!award || award.state !== 'active') return;
                            await cart.addAward(
                              `${award.listing.sellerPubky}:${award.listing.listingId}`,
                              award.variant.id,
                              award.quantity,
                              award.id,
                              offer.revision,
                            );
                            router.push(`${MARKETPLACE_ROUTES.AWARD_CHECKOUT}?offer=${offer.id}`);
                          }}
                        >
                          Buy for {formatCommerceMoney(offer.award.merchandiseTotal ?? offer.award.unitPrice)}
                        </Button>
                        <Typography as="p" className="text-xs text-muted-foreground">
                          Priced from your accepted offer
                        </Typography>
                      </div>
                    ) : actionable ? (
                      <div className="flex flex-wrap gap-2">
                        {incoming ? (
                          <>
                            <Button
                              size="sm"
                              className="rounded-full"
                              onClick={() => void offers.act(offer, 'offer.accept')}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="rounded-full"
                              onClick={() => setCountering(offer)}
                            >
                              Counter
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="rounded-full"
                              onClick={() => void offers.act(offer, 'offer.reject')}
                            >
                              Decline
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="rounded-full"
                            onClick={() => void offers.act(offer, 'offer.withdraw')}
                          >
                            Withdraw
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center">
            <HandCoins className="mb-3 size-10 text-muted-foreground" />
            <Heading level={2} size="md">
              No offers yet
            </Heading>
          </div>
        )}
      </Container>

      <Dialog open={Boolean(countering)} onOpenChange={(open) => !open && setCountering(null)}>
        <DialogContent className="border-border bg-popover">
          <DialogHeader>
            <DialogTitle>Send a counteroffer</DialogTitle>
          </DialogHeader>
          <ControlledInputField
            name="amount"
            control={offers.form.control}
            label={`Counter amount (${countering ? amountInputUnitLabel(countering.amount) : 'USD'})`}
            placeholder={countering && isBitcoinAsset(countering.amount) ? '110000' : '110.00'}
          />
          <ControlledInputField name="quantity" control={offers.form.control} label="Quantity" placeholder="1" />
          <ControlledTextareaField
            name="message"
            control={offers.form.control}
            label="Message"
            placeholder="Explain your terms"
          />
          <DialogFooter>
            <Button variant="secondary" className="rounded-full" onClick={() => setCountering(null)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={submitCounter}>
              Send counter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}

export function offerStateLabel(state: MarketplaceOffer['state'], expiresAt: string, nowMs = Date.now()): string {
  return state === 'accepted' && Date.parse(expiresAt) <= nowMs ? 'Expired' : state;
}

const LISTING_HYDRATION_CONCURRENCY = 4;

export async function loadOfferListings(offers: readonly MarketplaceOffer[]) {
  const ids = [...new Set(offers.map(listingCompositeId).filter(Boolean))];
  if (!ids.length) return new Map<string, CommerceListingRecord>();

  const localModels = await CommerceController.getManyListings(ids);
  const local = new Map([...localModels].map(([id, model]) => [id, model.record] as [string, CommerceListingRecord]));
  const missing = ids.filter((id) => !local.has(id));
  if (!missing.length) return local;

  const hydrated = new Map<string, CommerceListingRecord>();
  let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      const compositeId = missing[next++];
      const separator = compositeId.indexOf(':');
      try {
        const record = await CommerceController.getOrFetchListing(
          compositeId.slice(0, separator),
          compositeId.slice(separator + 1),
        );
        hydrated.set(compositeId, record);
      } catch {
        // Missing listings are rendered as unavailable after bounded hydration.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(LISTING_HYDRATION_CONCURRENCY, missing.length) }, () => worker()));
  return new Map([...local, ...hydrated]);
}

function listingCompositeId(offer: MarketplaceOffer): string {
  const listingRef = parseListingAggregateId(offer.listingAggregateId);
  return listingRef ? `${listingRef.sellerPubky}:${listingRef.listingId}` : '';
}

function useOfferListings(offers: readonly MarketplaceOffer[]) {
  const ids = useMemo(() => offers.map(listingCompositeId).filter(Boolean).sort().join('|'), [offers]);
  const [listings, setListings] = useState<Map<string, CommerceListingRecord>>(new Map());
  const [isHydrating, setIsHydrating] = useState(false);

  useEffect(() => {
    let active = true;
    const currentOffers = offers;
    setListings(new Map());
    setIsHydrating(false);
    void loadOfferListings(currentOffers).then((nextListings) => {
      if (!active) return;
      setListings(nextListings);
      setIsHydrating(false);
    });
    if (ids) setIsHydrating(true);
    return () => {
      active = false;
    };
  }, [ids, offers]);

  return { listings, isHydrating };
}

function useOfferAnchor() {
  const [offerId, setOfferId] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setOfferId(window.location.hash.startsWith('#offer-') ? window.location.hash.slice(7) : null);
    update();
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return offerId;
}

export function isLinkedOfferMissing(
  linkedOfferId: string | null,
  offers: readonly MarketplaceOffer[],
  isLoading: boolean,
  error: string | null,
): boolean {
  return !isLoading && !error && linkedOfferId !== null && !offers.some((offer) => offer.id === linkedOfferId);
}

export function OfferListingSummary({
  offer,
  listing,
  isHydrating = false,
}: {
  offer: MarketplaceOffer;
  listing?: CommerceListingRecord;
  isHydrating?: boolean;
}) {
  const listingRef = parseListingAggregateId(offer.listingAggregateId);

  if (!listingRef || !listing) {
    return (
      <Typography as="p" className="text-sm text-muted-foreground">
        {isHydrating ? 'Loading listing…' : 'Listing details unavailable'}
      </Typography>
    );
  }

  const imageUri = listing.media.find(({ type }) => type === 'image')?.url ?? null;
  return (
    <Link
      href={getMarketplaceListingRoute(listingRef.sellerPubky, listingRef.listingId)}
      overrideDefaults
      className="flex items-center gap-3 rounded-lg py-1 hover:text-brand"
    >
      <OfferThumbnail uri={imageUri} title={listing.title} />
      <Typography as="p" className="font-semibold hover:underline">
        {listing.title}
      </Typography>
    </Link>
  );
}

function OfferThumbnail({ uri, title }: { uri: string | null; title: string }) {
  const mediaUrl = useMarketplaceFirstMediaUrl(uri ? [uri] : []);
  return (
    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
      {mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl} alt={`${title} thumbnail`} className="size-full object-cover" />
      ) : (
        <HandCoins className="size-5 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );
}

export function parseListingAggregateId(value: string): { sellerPubky: string; listingId: string } | null {
  const encoded = value.startsWith('listing:') ? value.slice('listing:'.length) : '';
  if (encoded.length <= 53) return null;
  const sellerPubky = encoded.slice(0, 52);
  const listingId = encoded.slice(53);
  return sellerPubky && listingId ? { sellerPubky, listingId } : null;
}
