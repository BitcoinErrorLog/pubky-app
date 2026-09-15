import { notFound } from 'next/navigation';
import { ResourceDiscoveryPage } from '@/templates/ResourceDiscovery/ResourceDiscoveryPage';

export default async function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let decodedId: string;
  try {
    decodedId = decodeURIComponent(id);
  } catch {
    notFound();
  }
  return <ResourceDiscoveryPage id={decodedId} />;
}
