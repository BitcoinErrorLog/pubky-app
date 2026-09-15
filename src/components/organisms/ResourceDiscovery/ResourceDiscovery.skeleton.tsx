import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { RESOURCE_DISCOVERY_LIMIT, RESOURCE_DISCOVERY_TAGS_LIMIT } from '@/config/nexus';
import {
  CANONICAL_RESOURCE_LIMIT,
  CANONICAL_RESOURCE_SECTIONS,
} from '@/organisms/ResourceCanonShelf/ResourceCanonShelf';

export function ResourceDiscoverySkeleton() {
  return (
    <Container data-testid="resource-discovery-skeleton" className="w-full gap-6 pb-12">
      <Container overrideDefaults className="gap-3">
        <Skeleton className="h-8 w-64 rounded-md" />
        <Container overrideDefaults className="flex-row flex-wrap items-center gap-2">
          {Array.from({ length: RESOURCE_DISCOVERY_TAGS_LIMIT }, (_, index) => (
            <Skeleton key={`resource-tag-skeleton-${index}`} className="h-8 w-24 rounded-md" />
          ))}
          <Skeleton className="ml-auto h-8 w-24 rounded-md" />
        </Container>
      </Container>
      <Container overrideDefaults className="gap-8">
        {CANONICAL_RESOURCE_SECTIONS.map((section) => (
          <Container key={section.label} overrideDefaults className="gap-3">
            <Skeleton className="h-7 w-56 rounded-md" />
            <Container overrideDefaults className="grid gap-4 lg:grid-cols-3">
              {Array.from({ length: CANONICAL_RESOURCE_LIMIT }, (_, index) => (
                <ResourceCardSkeleton key={`${section.label}-resource-skeleton-${index}`} />
              ))}
            </Container>
          </Container>
        ))}
      </Container>
      <Container overrideDefaults className="gap-4">
        {Array.from({ length: RESOURCE_DISCOVERY_LIMIT }, (_, index) => (
          <ResourceCardSkeleton key={`resource-skeleton-${index}`} />
        ))}
      </Container>
    </Container>
  );
}

function ResourceCardSkeleton() {
  return (
    <Container overrideDefaults className="gap-3 rounded-md bg-card p-6 shadow-sm">
      <Skeleton className="h-5 w-56 rounded-md" />
      <Skeleton className="h-4 w-full rounded-md" />
      <Skeleton className="h-32 w-full rounded-md" />
    </Container>
  );
}
