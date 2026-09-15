import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function ResourceDiscoverySkeleton() {
  return (
    <Container data-testid="resource-discovery-skeleton" className="w-full gap-6 pb-12">
      <Skeleton className="h-8 w-64 rounded-md" />
      <Container overrideDefaults className="flex-row flex-wrap gap-2">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </Container>
      <Container overrideDefaults className="gap-4">
        {[0, 1, 2].map((item) => (
          <Container key={item} overrideDefaults className="gap-3 rounded-md bg-card p-6 shadow-sm">
            <Skeleton className="h-5 w-56 rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-32 w-full rounded-md" />
          </Container>
        ))}
      </Container>
    </Container>
  );
}
