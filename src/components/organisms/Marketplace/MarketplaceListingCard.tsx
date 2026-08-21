'use client';

import { useState } from 'react';
import { Camera, Disc3, Footprints, Gem, House, Keyboard, Package, Shirt } from 'lucide-react';
import { getMarketplaceListingRoute } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import type { MarketplaceCatalogItem } from '@/hooks/useMarketplaceCatalog/useMarketplaceCatalog.utils';
import { useMarketplaceLiveBid } from '@/hooks/useMarketplaceLiveBid/useMarketplaceLiveBid';
import { formatCommerceCondition, formatCommerceMoney } from '@/libs/commerce/format';
import { resolveFirstMarketplaceMediaUrl } from '@/libs/commerce/media-url';
import { cn } from '@/libs/utils/utils';
import { MarketplaceIndicativePrice } from '@/organisms/Marketplace/MarketplaceIndicativePrice';
import type { CommerceLayout } from '@/stores/commerce/commerce.types';

const MEDIA_BACKGROUNDS = [
  'from-brand/45 via-purple-500/20 to-background',
  'from-cyan-500/40 via-blue-500/20 to-background',
  'from-amber-500/45 via-orange-500/20 to-background',
  'from-emerald-500/40 via-teal-500/20 to-background',
  'from-rose-500/40 via-pink-500/20 to-background',
  'from-slate-400/35 via-zinc-500/20 to-background',
] as const;

export interface MarketplaceListingCardProps {
  listing: MarketplaceCatalogItem;
  shopName?: string;
  layout?: CommerceLayout;
}

/**
 * One catalog card, renderable purely from the Nexus index projection.
 *
 * Truthfulness constraint: live auction state (current bid, bid count) is
 * not part of the listing record or its index projection — it lives in the
 * transaction service. In `transaction-service` mode the card lazily reads
 * the service's public listing projection once it scrolls into view (see
 * `useMarketplaceLiveBid` for the cost model) and, only when at least one
 * bid actually exists, relabels the price as the current bid. In every
 * other case — no bids yet, service unreachable, sandbox or read-only
 * modes — the card shows only the seller's terms from the index: the
 * starting bid (labeled as such, never as a current price), the optional
 * buy-now price, and the end date. An auction whose index row predates the
 * term fields (`auction === null`) simply omits the term badges instead of
 * guessing.
 */
export function MarketplaceListingCard({ listing, shopName, layout = 'grid' }: MarketplaceListingCardProps) {
  const background = MEDIA_BACKGROUNDS[colorIndex(listing.listingId)];
  const isAuction = listing.saleFormat === 'auction';
  const { ref: liveBidRef, bid } = useMarketplaceLiveBid(listing.sellerId, listing.listingId, isAuction);
  const hasLiveBid = isAuction && bid !== null && bid.bidCount > 0;
  // The gradient+icon stays rendered UNDER the image, so it is also the
  // loading state; a failed load unmounts the image instead of showing a
  // broken-image icon.
  const [mediaFailed, setMediaFailed] = useState(false);
  const mediaUrl = resolveFirstMarketplaceMediaUrl(listing.mediaUrls);
  const showMedia = mediaUrl !== null && !mediaFailed;

  return (
    <Link
      href={getMarketplaceListingRoute(listing.sellerId, listing.listingId)}
      overrideDefaults
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`View ${listing.title}`}
    >
      <Card
        ref={liveBidRef}
        className={cn(
          'h-full gap-0 overflow-hidden border border-border/60 py-0 transition-all group-hover:-translate-y-0.5 group-hover:border-brand/40 group-hover:shadow-lg',
          layout === 'list' && 'flex-row',
        )}
      >
        <div
          className={cn(
            `relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-linear-to-br ${background}`,
            layout === 'list' && 'aspect-square w-36 shrink-0 sm:w-48',
          )}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.16),transparent_32%)]" />
          <MarketplaceCategoryIcon categoryId={listing.categoryId} />
          {showMedia && (
            <Image
              src={mediaUrl}
              alt={listing.title}
              fill
              sizes="(max-width: 640px) 50vw, 300px"
              className="absolute inset-0 object-cover"
              onError={() => setMediaFailed(true)}
            />
          )}
          <Badge className="absolute top-3 left-3 bg-background/85 text-foreground shadow-sm backdrop-blur-md">
            {isAuction ? 'Auction' : 'Buy now'}
          </Badge>
          {listing.auction && (
            <Badge variant="secondary" className="absolute right-3 bottom-3 bg-background/85 backdrop-blur-md">
              Ends {formatAuctionEnd(listing.auction.endsAt)}
            </Badge>
          )}
        </div>

        <CardContent className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <Typography as="h2" className="line-clamp-2 text-base leading-5 font-semibold text-foreground">
              {listing.title}
            </Typography>
            <div className="flex shrink-0 flex-col items-end">
              {isAuction && (
                <Typography as="span" className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  {hasLiveBid ? 'Current bid' : 'Starting bid'}
                </Typography>
              )}
              <Typography as="p" className="text-base font-bold text-brand">
                {formatCommerceMoney(hasLiveBid ? bid.currentPrice : listing.price)}
              </Typography>
              <MarketplaceIndicativePrice money={hasLiveBid ? bid.currentPrice : listing.price} />
              {hasLiveBid && (
                <Typography as="span" className="text-xs text-muted-foreground">
                  {bid.bidCount} {bid.bidCount === 1 ? 'bid' : 'bids'}
                </Typography>
              )}
              {listing.auction?.buyNowPrice && (
                <Typography as="span" className="text-xs text-muted-foreground">
                  Buy now {formatCommerceMoney(listing.auction.buyNowPrice)}
                </Typography>
              )}
            </div>
          </div>
          <Typography as="p" className="truncate text-sm text-muted-foreground">
            {shopName ?? `${listing.sellerId.slice(0, 8)}…`}
          </Typography>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <Typography as="span" className="text-xs text-muted-foreground">
              {formatCommerceCondition(listing.condition)}
            </Typography>
            <Typography as="span" className="text-xs text-muted-foreground">
              {listing.location.region ? `${listing.location.region}, ` : ''}
              {listing.location.countryCode}
            </Typography>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// Deterministic per-listing gradient, seeded by the listing id so the card
// keeps its color whether it rendered from the index projection or from the
// hydrated record. It is the loading/error backdrop for cards with media and
// the honest permanent rendering for cards without any.
function colorIndex(listingId: string): number {
  let sum = 0;
  for (let index = 0; index < listingId.length; index++) {
    sum = (sum + listingId.charCodeAt(index)) % MEDIA_BACKGROUNDS.length;
  }
  return sum;
}

function formatAuctionEnd(endsAt: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(endsAt));
}

function MarketplaceCategoryIcon({ categoryId }: { categoryId: string }) {
  const className = 'size-20 text-foreground/75 drop-shadow-xl transition-transform group-hover:scale-105';
  switch (true) {
    case categoryId.includes('camera'):
      return <Camera aria-hidden="true" className={className} />;
    case categoryId.includes('vinyl'):
      return <Disc3 aria-hidden="true" className={className} />;
    case categoryId.includes('shoes'):
      return <Footprints aria-hidden="true" className={className} />;
    case categoryId.includes('jewelry'):
      return <Gem aria-hidden="true" className={className} />;
    case categoryId.includes('home'):
      return <House aria-hidden="true" className={className} />;
    case categoryId.includes('keyboard'):
      return <Keyboard aria-hidden="true" className={className} />;
    case categoryId.includes('fashion'):
      return <Shirt aria-hidden="true" className={className} />;
    default:
      return <Package aria-hidden="true" className={className} />;
  }
}
