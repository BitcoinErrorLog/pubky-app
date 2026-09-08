'use client';

import { ExternalLink } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { getSafeExternalUrl } from '@/libs/utils/safeExternalUrl';
import { GenericPreview } from '@/molecules/PostLinkEmbeds/Providers/Generic/GenericPreview';
import type { NexusResource } from '@/services/nexus/resource/resource.types';

export function ResourceCard({ resource }: { resource: NexusResource }) {
  const safeUrl = getSafeExternalUrl(resource.details.uri);

  return (
    <Container data-surface="resource-card" className="gap-3 rounded-lg border border-border/60 p-4">
      <Container overrideDefaults className="gap-1">
        <Typography as="h2" size="lg" className="font-medium">
          {resource.details.uri}
        </Typography>
        <Typography size="sm" className="text-muted-foreground">
          {resource.tags.map((tag) => tag.label).join(', ')}
        </Typography>
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
