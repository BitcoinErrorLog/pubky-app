'use client';

import { useRouter } from 'next/navigation';
import { ExternalLink, Share2 } from 'lucide-react';
import { getResourceRoute } from '@/app/routes';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { JEB_TAGGER_PUBKY_PREFIX } from '@/config/nexus';
import { useEnrichedTags } from '@/hooks/useEnrichedTags/useEnrichedTags';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { getSafeExternalUrl } from '@/libs/utils/safeExternalUrl';
import { PostPreviewCard } from '@/molecules/PostPreviewCard/PostPreviewCard';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { PostTagPopoverWrapper } from '@/molecules/PostTagPopoverWrapper/PostTagPopoverWrapper';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import type { NexusResource } from '@/services/nexus/resource/resource.types';

export type ResourceCardVariant = 'feed' | 'detail' | 'inline';

export interface ResourceCardProps {
  resource: NexusResource;
  variant?: ResourceCardVariant;
  showDetailsLink?: boolean;
}

export function ResourceCard({ resource, variant = 'feed', showDetailsLink = false }: ResourceCardProps) {
  const router = useRouter();
  const safeUrl = getSafeExternalUrl(resource.details.uri);
  const { metadata } = useOgMetadata(safeUrl);
  const tags = toTagWithAvatars(resource);
  const { enrichedTags } = useEnrichedTags(tags);
  const isPubkyPost = resource.details.uri.startsWith('pubky://') && resource.details.uri.includes('/posts/');
  const detailsHref = getResourceRoute(resource.details.id);
  const displayUrl = safeUrl ? displayExternalUrl(safeUrl) : resource.details.uri;
  const hasJebTag = resource.tags.some((tag) =>
    tag.taggers.some((tagger) => tagger.startsWith(JEB_TAGGER_PUBKY_PREFIX)),
  );

  async function shareResource() {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: metadata?.title ?? displayUrl, url: resource.details.uri });
      return;
    }
    await navigator.clipboard?.writeText(resource.details.uri);
  }

  return (
    <Container data-surface="resource-card" className="gap-3 rounded-lg border border-border/60 p-4">
      <Container overrideDefaults className="gap-2">
        <Container overrideDefaults className="flex-row items-center justify-between gap-2">
          <Typography as="span" size="sm" className="text-muted-foreground">
            <span className="truncate">{safeUrl ? new URL(safeUrl).host : resource.details.scheme || 'Resource'}</span>
            <span aria-hidden="true"> · </span>
            <span>{new Date(resource.details.indexed_at).toLocaleDateString('en-US', { timeZone: 'UTC' })}</span>
          </Typography>
        </Container>
        {!safeUrl && !isPubkyPost ? (
          <Typography as="h2" size={variant === 'inline' ? 'md' : 'lg'} className="font-medium">
            Unsupported link
          </Typography>
        ) : isPubkyPost ? (
          <PostPreviewCard postId={toCompositePostId(resource.details.uri)} interactiveActions={false} />
        ) : (
          <Link href={detailsHref} className="block rounded-md">
            <Container overrideDefaults className="gap-2">
              <Typography as="h2" size={variant === 'inline' ? 'md' : 'lg'} className="font-medium">
                {metadata?.title || displayUrl}
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
        )}
      </Container>
      <Container overrideDefaults className="flex flex-wrap items-center gap-2">
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
              countLabel="taggers"
              selected={tag.relationship}
              onClick={() => router.push(`/search?tags=${encodeURIComponent(tag.label)}`)}
            />
          </PostTagPopoverWrapper>
        ))}
        {hasJebTag ? (
          <Typography
            as="span"
            className="rounded-full border border-brand/40 px-2 py-1 text-xs text-brand"
            aria-label="Suggested by Jeb"
          >
            suggested by Jeb
          </Typography>
        ) : null}
      </Container>
      <Container overrideDefaults className="flex flex-wrap items-center gap-2">
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
      </Container>
    </Container>
  );
}

function toTagWithAvatars(resource: NexusResource): TagWithAvatars[] {
  return resource.tags.map((tag) => ({
    ...tag,
    taggers: tag.taggers.map((id) => ({ id, name: undefined, avatarUrl: undefined })),
  }));
}

function toCompositePostId(uri: string): string {
  const parsed = new URL(uri);
  const postId = parsed.pathname.split('/').filter(Boolean).at(-1) ?? '';
  return `${parsed.hostname}:${postId}`;
}

function displayExternalUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.host}${parsed.pathname}${parsed.search}`;
}
