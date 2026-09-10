'use client';

import { useInlineResource } from '@/hooks/useInlineResource/useInlineResource';
import { ResourceCard } from '@/organisms/ResourceCard/ResourceCard';

export function InlineResourceCard({ content }: { content: string }) {
  const { resource } = useInlineResource(content);
  if (!resource) return null;
  return <ResourceCard resource={resource} variant="inline" />;
}
