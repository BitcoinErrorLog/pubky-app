'use client';

import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceModeration } from '@/hooks/useMarketplaceModeration/useMarketplaceModeration';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';

export function MarketplaceModeration() {
  const moderation = useMarketplaceModeration();

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28"
      classNameWrapperContent="max-w-4xl"
    >
      <Container overrideDefaults className="flex w-full flex-col gap-6 px-4 sm:px-6">
        <Link href={APP_ROUTES.MARKETPLACE} overrideDefaults className="inline-flex w-fit items-center gap-2 text-sm">
          <ArrowLeft className="size-4" />
          Marketplace
        </Link>
        <div>
          <Heading level={1} size="xl" className="text-4xl sm:text-6xl">
            Moderation queue
          </Heading>
          <Typography as="p" className="mt-2 text-muted-foreground">
            Structured reports are role-scoped and append-only.
          </Typography>
        </div>

        {moderation.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : moderation.error ? (
          <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
            {moderation.error}
          </div>
        ) : moderation.reports.length ? (
          <div className="grid gap-3">
            {moderation.reports.map((report) => (
              <Card key={report.id} className="border py-4">
                <CardContent className="grid gap-2 px-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge>{report.reason.replaceAll('_', ' ')}</Badge>
                    <Badge variant="secondary">{report.targetType}</Badge>
                  </div>
                  <Typography as="p" className="font-semibold">
                    {report.targetId}
                  </Typography>
                  <Typography as="p" className="text-sm text-muted-foreground">
                    {report.details}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed">
            <ShieldAlert className="mb-3 size-10 text-muted-foreground" />
            <Heading level={2} size="md">
              Queue clear
            </Heading>
          </div>
        )}
      </Container>
    </ContentLayout>
  );
}
