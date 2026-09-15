'use client';

import { useRouter } from 'next/navigation';
import { ExternalLink, Share2 } from 'lucide-react';
import { getResourceRoute, getResourceTagRoute } from '@/app/routes';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useEnrichedTags } from '@/hooks/useEnrichedTags/useEnrichedTags';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { getSafeExternalUrl } from '@/libs/utils/safeExternalUrl';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import type { Resource } from '@/models/resource/resource';
import { PostPreviewCard } from '@/molecules/PostPreviewCard/PostPreviewCard';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { PostTagPopoverWrapper } from '@/molecules/PostTagPopoverWrapper/PostTagPopoverWrapper';
import { transformTagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.utils';
import { toast } from '@/molecules/Toaster/toast';

export type ResourceCardVariant = 'feed' | 'detail' | 'inline';

export interface ResourceCardProps {
  resource: Resource;
  variant?: ResourceCardVariant;
  showDetailsLink?: boolean;
}

export function ResourceCard({ resource, variant = 'feed', showDetailsLink = false }: ResourceCardProps) {
  const router = useRouter();
  const safeUrl = getSafeExternalUrl(resource.details.uri);
  const { metadata } = useOgMetadata(safeUrl);
  const { enrichedTags } = useEnrichedTags(resource.tags.map(transformTagWithAvatars));
  const postId = buildCompositeIdFromPubkyUri({ uri: resource.details.uri, domain: CompositeIdDomain.POSTS });
  const detailsHref = getResourceRoute(resource.details.id);
  const displayUrl = safeUrl ? displayExternalUrl(safeUrl) : resource.details.uri;
  const safeHost = safeUrl ? new URL(safeUrl).host : resource.details.scheme || 'Resource';

  async function shareResource() {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: metadata?.title ?? displayUrl, url: resource.details.uri });
        return;
      }
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(resource.details.uri);
      toast({ title: 'Link copied' });
    } catch {
      toast({ variant: 'error', description: 'Could not share this resource.' });
    }
  }

  return (
    <Card data-surface="resource-card" className="gap-0 rounded-md py-0">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-2">
          {!safeUrl && !postId ? (
            <>
              <ResourceMetadata host={resource.details.scheme || 'Resource'} indexedAt={resource.details.indexed_at} />
              <Typography as="h2" size={variant === 'inline' ? 'md' : 'lg'}>
                Unsupported link
              </Typography>
            </>
          ) : postId ? (
            <>
              <ResourceMetadata host={safeHost} indexedAt={resource.details.indexed_at} />
              <PostPreviewCard postId={postId} interactiveActions={false} />
            </>
          ) : (
            <Link href={detailsHref} className="block rounded-md">
              <div className="flex justify-between gap-6 lg:flex-row @max-xl/grid:flex-col!">
                <div className="flex min-w-0 flex-1 flex-col gap-y-2">
                  <ResourceMetadata host={safeHost} indexedAt={resource.details.indexed_at} />
                  <Typography as="h2" size={variant === 'inline' ? 'md' : 'lg'}>
                    {metadata?.title || displayUrl}
                  </Typography>
                  {metadata?.description ? (
                    <Typography size="sm" className="line-clamp-3 text-muted-foreground">
                      {metadata.description}
                    </Typography>
                  ) : null}
                </div>
                {metadata?.image ? (
                  <Image
                    src={metadata.image}
                    alt=""
                    width={180}
                    height={100}
                    onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    className="h-25 w-45 shrink-0 rounded-md object-cover object-center"
                  />
                ) : null}
              </div>
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {enrichedTags.map((tag) => (
            <PostTagPopoverWrapper
              key={tag.label}
              taggers={tag.taggers}
              taggersCount={tag.taggers_count}
              tagLabel={tag.label}
            >
              <PostTag
                label={tag.label}
                count={tag.taggers_count}
                countLabel={tag.taggers_count === 1 ? 'tagger' : 'taggers'}
                selected={tag.relationship}
                onClick={() => router.push(getResourceTagRoute(tag.label))}
              />
            </PostTagPopoverWrapper>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {safeUrl ? (
            <Button asChild size="sm" variant={ButtonVariant.OUTLINE}>
              <Link href={safeUrl}>
                <ExternalLink aria-hidden="true" />
                Open original
              </Link>
            </Button>
          ) : null}
          <Button type="button" size="sm" variant={ButtonVariant.OUTLINE} onClick={() => void shareResource()}>
            <Share2 aria-hidden="true" />
            Share
          </Button>
          {showDetailsLink ? (
            <Link href={detailsHref} variant="muted">
              View details
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ResourceMetadata({ host, indexedAt }: { host: string; indexedAt: number }) {
  return (
    <Typography as="span" size="sm" className="text-muted-foreground">
      <span className="truncate">{host}</span>
      <span aria-hidden="true"> · </span>
      <span>{new Date(indexedAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}</span>
    </Typography>
  );
}

function displayExternalUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.host}${parsed.pathname}${parsed.search}`;
}
