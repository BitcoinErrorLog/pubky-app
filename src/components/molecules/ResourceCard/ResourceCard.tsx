'use client';

import type { NexusResource } from '@/services/nexus/resource/resource.types';
import { ResourceCard as ResourceCardOrganism } from '@/organisms/ResourceCard/ResourceCard';

export function ResourceCard({
  resource,
  showDetailsLink = false,
}: {
  resource: NexusResource;
  showDetailsLink?: boolean;
}) {
  return <ResourceCardOrganism resource={resource} showDetailsLink={showDetailsLink} />;
}
