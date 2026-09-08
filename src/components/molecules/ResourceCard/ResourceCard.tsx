'use client';

import { ExternalLink } from 'lucide-react';
import { getResourceRoute } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { RESOURCE_STREAM_TAGS_PREVIEW } from '@/config/nexus';
import { getSafeExternalUrl } from '@/libs/utils/safeExternalUrl';
import { GenericPreview } from '@/molecules/PostLinkEmbeds/Providers/Generic/GenericPreview';
import type { NexusResource } from '@/services/nexus/resource/resource.types';

export function ResourceCard({
  resource,
  showDetailsLink = false,
}: {
  resource: NexusResource;
  showDetailsLink?: boolean;
}) {
  const safeUrl = getSafeExternalUrl(resource.details.uri);
  const detailsHref = getResourceRoute(resource.details.id);

  return (
    <Container data-surface="resource-card" className="gap-3 rounded-lg border border-border/60 p-4">
      <Container overrideDefaults className="gap-1">
        <Typography as="h2" size="lg" className="font-medium">
          {showDetailsLink ? <Link href={detailsHref}>{resource.details.uri}</Link> : resource.details.uri}
        </Typography>
        <Typography size="sm" className="text-muted-foreground">
          {resource.tags.map((tag) => tag.label).join(', ')}
        </Typography>
        {showDetailsLink && resource.tags.length === RESOURCE_STREAM_TAGS_PREVIEW ? (
          <Typography size="sm" className="text-muted-foreground">
            More tags
          </Typography>
        ) : null}
        {safeUrl === null ? (
          <Typography size="sm" className="text-muted-foreground">
            Unsupported link
          </Typography>
        ) : null}
      </Container>
      {safeUrl ? (
        <>
          <GenericPreview url={safeUrl} />
          <Link href={safeUrl} className="inline-flex items-center gap-1 text-sm text-brand">
            Open resource
            <ExternalLink size={14} aria-hidden="true" />
          </Link>
        </>
      ) : null}
    </Container>
  );
}
