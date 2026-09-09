'use client';

import { useSearchParams } from 'next/navigation';
import { ResourceDiscoveryPage } from '@/templates/ResourceDiscovery/ResourceDiscoveryPage';

export default function ResourceLookupPage() {
  const searchParams = useSearchParams();
  return <ResourceDiscoveryPage id={searchParams.get('uri') ?? ''} />;
}
