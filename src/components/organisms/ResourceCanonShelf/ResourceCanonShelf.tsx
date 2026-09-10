'use client';

import { useEffect, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { ResourceController } from '@/controllers/resource/resource';
import { ResourceCard } from '@/organisms/ResourceCard/ResourceCard';
import type { NexusResource } from '@/services/nexus/resource/resource.types';

const CANON_LABELS = [
  { label: 'bip', title: 'Bitcoin Improvement Proposals' },
  { label: 'research', title: 'Research' },
  { label: 'optech', title: 'Bitcoin Optech' },
] as const;

export function ResourceCanonShelf() {
  return (
    <Container overrideDefaults className="flex flex-col gap-8">
      {CANON_LABELS.map((section) => (
        <CanonRow key={section.label} label={section.label} title={section.title} />
      ))}
    </Container>
  );
}

function CanonRow({ label, title }: { label: string; title: string }) {
  const [resources, setResources] = useState<NexusResource[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void ResourceController.fetchByTag({
      tag: label,
      limit: 3,
      limit_tags: 50,
      limit_taggers: 50,
      sorting: 'taggers_count',
    })
      .then((result) => {
        if (active) setResources(result);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [label]);

  return (
    <Container overrideDefaults className="gap-3">
      <Heading level={2} size="lg">
        {title}
      </Heading>
      {isLoading ? (
        <Typography className="text-muted-foreground">Loading resources…</Typography>
      ) : resources.length === 0 ? (
        <Typography className="text-muted-foreground">No resources tagged {label} yet.</Typography>
      ) : (
        <Container overrideDefaults className="grid gap-4 lg:grid-cols-3">
          {resources.map((resource) => (
            <ResourceCard key={resource.details.id} resource={resource} variant="inline" showDetailsLink />
          ))}
        </Container>
      )}
    </Container>
  );
}
