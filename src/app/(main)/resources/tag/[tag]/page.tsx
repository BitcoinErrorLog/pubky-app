import { ResourceDiscoveryPage } from '@/templates/ResourceDiscovery/ResourceDiscoveryPage';

export default async function ResourceTagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  return <ResourceDiscoveryPage tag={decodeURIComponent(tag)} />;
}
