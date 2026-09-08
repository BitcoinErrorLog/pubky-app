import { ResourceDiscoveryPage } from '@/templates/ResourceDiscovery/ResourceDiscoveryPage';

export default async function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResourceDiscoveryPage id={decodeURIComponent(id)} />;
}
