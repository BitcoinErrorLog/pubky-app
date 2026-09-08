import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function ResourceDiscoverySkeleton() {
  return (
    <Container data-testid="resource-discovery-skeleton" className="gap-4">
      <Skeleton className="h-8 w-64 rounded-md" />
      <Container className="gap-3 rounded-lg border border-border/60 p-4">
        <Skeleton className="h-6 w-56 rounded-md" />
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </Container>
    </Container>
  );
}
