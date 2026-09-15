'use client';

import { useEffect, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { ResourceController } from '@/controllers/resource/resource';
import type { Resource } from '@/models/resource/resource';
import { toast } from '@/molecules/Toaster/toast';
import { ResourceCard } from '@/organisms/ResourceCard/ResourceCard';

export const CANONICAL_RESOURCE_SECTIONS = [
  { label: 'bip', title: 'Bitcoin Improvement Proposals' },
  { label: 'research', title: 'Research' },
  { label: 'optech', title: 'Bitcoin Optech' },
] as const;
export const CANONICAL_RESOURCE_LIMIT = 3;

export function ResourceCanonShelf() {
  return (
    <Container overrideDefaults className="flex flex-col gap-8">
      {CANONICAL_RESOURCE_SECTIONS.map((section) => (
        <CanonRow key={section.label} label={section.label} title={section.title} />
      ))}
    </Container>
  );
}

function CanonRow({ label, title }: { label: string; title: string }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void ResourceController.fetchByTag({
      tag: label,
      limit: CANONICAL_RESOURCE_LIMIT,
      limit_tags: 50,
      limit_taggers: 50,
      sorting: 'taggers_count',
    })
      .then((result) => {
        if (active) setResources(result);
      })
      .catch(() => {
        if (active) toast({ variant: 'error', description: 'Could not load canonical resources.' });
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
