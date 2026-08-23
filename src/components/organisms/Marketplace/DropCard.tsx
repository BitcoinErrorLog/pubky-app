'use client';

import { CalendarClock } from 'lucide-react';
import { getMarketplaceDropRoute } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import type { DropStreamBucket, NexusDropStreamEntry } from '@/hooks/useMarketplaceDrops/drops-stream';
import { resolveFirstMarketplaceMediaUrl } from '@/libs/commerce/media-url';
import { DropCountdown } from './DropCountdown';

const BUCKET_BADGES: Record<DropStreamBucket, string> = {
  upcoming: 'Upcoming · estimate',
  live: 'May be live · open to confirm',
  ended: 'Ended · estimate',
};

/**
 * One indexed drop on the shelf/calendar (drops design, "Discovery and hype
 * surfaces"). Everything here is INDEX data: the state chip and the
 * countdown are labeled estimates, and no claim affordance ever renders
 * from a card — opening the page hydrates the authoritative service
 * projection first.
 */
export function DropCard({ entry, bucket }: { entry: NexusDropStreamEntry; bucket: DropStreamBucket }) {
  const mediaUrl = resolveFirstMarketplaceMediaUrl(entry.media_urls);
  return (
    <Link
      href={getMarketplaceDropRoute(entry.owner_id, entry.id)}
      overrideDefaults
      className="flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-brand/40"
    >
      {mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- homeserver media bypasses Next image optimization
        <img src={mediaUrl} alt="" className="h-36 w-full object-cover" />
      ) : (
        <div className="flex h-36 w-full items-center justify-center bg-linear-to-br from-brand/20 via-card to-card">
          <CalendarClock className="size-8 text-muted-foreground" />
        </div>
      )}
      <div className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={bucket === 'live' ? 'default' : 'secondary'}>{BUCKET_BADGES[bucket]}</Badge>
        </div>
        <Typography as="p" className="truncate font-semibold">
          {entry.title}
        </Typography>
        {bucket === 'upcoming' && (
          <DropCountdown
            startsAt={entry.starts_at}
            endsAt={entry.ends_at ?? null}
            clockOffsetMs={null}
            phaseLabel="Starts in (estimate)"
            compact
          />
        )}
        <Typography as="p" className="text-xs text-muted-foreground">
          From index times — the drop page confirms the real state with the transaction service.
        </Typography>
      </div>
    </Link>
  );
}
