'use client';

import { ResourceCard as ResourceCardOrganism } from '@/organisms/ResourceCard/ResourceCard';
import type { NexusResource } from '@/services/nexus/resource/resource.types';

export function ResourceCard({
  resource,
  showDetailsLink = false,
}: {
  resource: NexusResource;
  showDetailsLink?: boolean;
}) {
  return <ResourceCardOrganism resource={resource} showDetailsLink={showDetailsLink} />;
}
