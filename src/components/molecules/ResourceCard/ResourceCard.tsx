'use client';

import { getResourceRoute, getResourceTagRoute } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { RESOURCE_STREAM_TAGS_PREVIEW } from '@/config/nexus';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { getSafeExternalUrl } from '@/libs/utils/safeExternalUrl';
import { PostTag } from '@/molecules/PostTag/PostTag';
import type { NexusResource } from '@/services/nexus/resource/resource.types';

export function ResourceCard({
  resource,
  showDetailsLink = false,
}: {
  resource: NexusResource;
  showDetailsLink?: boolean;
}) {
  const safeUrl = getSafeExternalUrl(resource.details.uri);
  const { metadata } = useOgMetadata(safeUrl);
  const detailsHref = getResourceRoute(resource.details.id);
  const displayUrl = safeUrl ? displayExternalUrl(safeUrl) : resource.details.uri;
  const headline = metadata?.title || displayUrl;

  return (
    <Container data-surface="resource-card" className="gap-3 rounded-lg border border-border/60 p-4">
      <Link href={detailsHref} className="block rounded-md">
        <Container overrideDefaults className="gap-2">
          <Typography as="h2" size="lg" className="font-medium">
            {headline}
          </Typography>
          {metadata?.description ? (
            <Typography size="sm" className="line-clamp-3 text-muted-foreground">
              {metadata.description}
            </Typography>
          ) : null}
          {metadata?.image ? (
            <Image
              src={metadata.image}
              alt=""
              width={640}
              height={360}
              className="aspect-video h-auto max-h-64 w-full rounded-md object-cover"
            />
          ) : null}
        </Container>
      </Link>
      <Container overrideDefaults className="flex flex-wrap items-center gap-2">
        {resource.tags.map((tag) => (
          <PostTag
            key={tag.label}
            label={tag.label}
            count={tag.taggers_count}
            onClick={() => window.location.assign(getResourceTagRoute(tag.label))}
          />
        ))}
        {showDetailsLink && resource.tags.length === RESOURCE_STREAM_TAGS_PREVIEW ? (
          <Typography size="sm" className="self-center text-muted-foreground">
            More tags
          </Typography>
        ) : null}
      </Container>
      {safeUrl ? (
        <Link href={safeUrl} className="text-sm text-brand">
          {displayUrl}
        </Link>
      ) : (
        <Typography size="sm" className="text-muted-foreground">
          Unsupported link
        </Typography>
      )}
    </Container>
  );
}

function displayExternalUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
}
