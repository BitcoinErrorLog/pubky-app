import { notFound } from 'next/navigation';
import { isValidTagLabel } from '@/libs/utils/utils';
import { ResourceDiscoveryPage } from '@/templates/ResourceDiscovery/ResourceDiscoveryPage';

export default async function ResourceTagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag: encodedTag } = await params;
  let tag: string;
  try {
    tag = decodeURIComponent(encodedTag);
  } catch {
    notFound();
  }
  if (!isValidTagLabel(tag)) {
    notFound();
  }
  return <ResourceDiscoveryPage tag={tag} />;
}
