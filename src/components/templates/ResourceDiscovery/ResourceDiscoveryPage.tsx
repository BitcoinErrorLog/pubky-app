import { Container } from '@/atoms/Container/Container';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { ResourceDiscovery } from '@/organisms/ResourceDiscovery/ResourceDiscovery';

export function ResourceDiscoveryPage({ tag, id }: { tag?: string; id?: string }) {
  return (
    <ContentLayout showLeftSidebar={false} showRightSidebar={false} showLeftMobileButton={false} showRightMobileButton={false}>
      <Container className="w-full">
        <ResourceDiscovery tag={tag} id={id} />
      </Container>
    </ContentLayout>
  );
}
