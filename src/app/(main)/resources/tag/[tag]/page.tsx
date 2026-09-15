import { notFound } from 'next/navigation';
import { ResourceDiscoveryPage } from '@/templates/ResourceDiscovery/ResourceDiscoveryPage';

export default async function ResourceTagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag: encodedTag } = await params;
  let tag: string;
  try {
    tag = decodeURIComponent(encodedTag);
  } catch {
    notFound();
  }
  return <ResourceDiscoveryPage tag={tag} />;
}
