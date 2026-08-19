import { Card, CardContent } from '@/atoms/Card/Card';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { COMMERCE_CATALOG_SKELETON_COUNT } from '@/config/commerce';

export function MarketplaceSkeleton({ count = COMMERCE_CATALOG_SKELETON_COUNT }: { count?: number }) {
  return (
    <div data-testid="marketplace-skeleton" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} className="gap-0 overflow-hidden py-0">
          <Skeleton className="aspect-[4/5] w-full rounded-none" />
          <CardContent className="flex flex-col gap-3 p-4">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
