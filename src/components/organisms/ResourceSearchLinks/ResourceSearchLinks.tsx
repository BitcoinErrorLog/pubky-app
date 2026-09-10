'use client';

import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { useResourceTagSearch } from '@/hooks/useResourceTagSearch/useResourceTagSearch';
import { ResourceCard } from '@/organisms/ResourceCard/ResourceCard';

export function ResourceSearchLinks({ tag }: { tag: string | null }) {
  const { resources, isLoading, error } = useResourceTagSearch(tag);

  if (!tag) return null;
  if (isLoading) return <Typography className="text-muted-foreground">Loading links…</Typography>;
  if (error) return <Typography role="alert">Could not load links.</Typography>;

  return (
    <Container
      overrideDefaults
      data-surface="resource-search-links"
      data-testid="resource-search-links"
      className="flex w-full flex-col gap-4"
    >
      <Heading level={2} size="lg" className="font-light text-muted-foreground">
        Links
      </Heading>
      {resources.length === 0 ? (
        <Typography className="text-muted-foreground">No links use this tag yet.</Typography>
      ) : (
        <Container overrideDefaults className="flex w-full flex-col gap-4">
          {resources.map((resource) => (
            <ResourceCard key={resource.details.id} resource={resource} variant="feed" showDetailsLink />
          ))}
        </Container>
      )}
    </Container>
  );
}
