import { Badge } from '@/atoms/Badge/Badge';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';

export default function MarketplaceSellPage() {
  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28"
    >
      <Container overrideDefaults className="w-full max-w-3xl px-4 sm:px-6">
        <Card className="border">
          <CardContent className="flex flex-col gap-4 px-6">
            <Badge className="w-fit">Seller studio</Badge>
            <Heading level={1} size="xl" className="text-4xl">
              Create a listing
            </Heading>
            <Typography as="p" className="text-muted-foreground">
              Draft autosave, media upload, variants, shipping, returns, auctions, and Locks-backed digital delivery are
              being connected to this studio.
            </Typography>
          </CardContent>
        </Card>
      </Container>
    </ContentLayout>
  );
}
