'use client';

import { Camera, Disc3, Footprints, Gem, House, Keyboard, Package, Shirt } from 'lucide-react';
import { getMarketplaceListingRoute } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { formatCommerceCondition, formatCommerceMoney } from '@/libs/commerce/format';
import { cn } from '@/libs/utils/utils';
import type { CommerceListingModelSchema } from '@/models/commerce/commerce.schema';
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
  listing: CommerceListingModelSchema;
  shopName?: string;
  layout?: CommerceLayout;
}

export function MarketplaceListingCard({ listing, shopName, layout = 'grid' }: MarketplaceListingCardProps) {
  const record = listing.record;
  const price = record.sale.format === 'fixed_price' ? record.sale.unitPrice : record.sale.startingPrice;
  const colorIndex = Number.parseInt(record.media[0]?.contentHash.charAt(0) ?? '0', 16) % MEDIA_BACKGROUNDS.length;
  const background = MEDIA_BACKGROUNDS[colorIndex] ?? MEDIA_BACKGROUNDS[0];

  return (
    <Link
      href={getMarketplaceListingRoute(record.ownerPubky, record.listingId)}
      overrideDefaults
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`View ${record.title}`}
    >
      <Card
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
          <MarketplaceCategoryIcon categoryId={record.categoryId} />
          <Badge className="absolute top-3 left-3 bg-background/85 text-foreground shadow-sm backdrop-blur-md">
            {record.sale.format === 'auction' ? 'Auction' : 'Buy now'}
          </Badge>
          {record.sale.format === 'auction' && (
            <Badge variant="secondary" className="absolute right-3 bottom-3 bg-background/85 backdrop-blur-md">
              Ends {formatAuctionEnd(record.sale.endsAt)}
            </Badge>
          )}
        </div>

        <CardContent className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <Typography as="h2" className="line-clamp-2 text-base leading-5 font-semibold text-foreground">
              {record.title}
            </Typography>
            <Typography as="p" className="shrink-0 text-base font-bold text-brand">
              {formatCommerceMoney(price)}
            </Typography>
          </div>
          <Typography as="p" className="truncate text-sm text-muted-foreground">
            {shopName ?? `${record.ownerPubky.slice(0, 8)}…`}
          </Typography>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <Typography as="span" className="text-xs text-muted-foreground">
              {formatCommerceCondition(record.condition)}
            </Typography>
            <Typography as="span" className="text-xs text-muted-foreground">
              {record.location.region ? `${record.location.region}, ` : ''}
              {record.location.countryCode}
            </Typography>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
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
