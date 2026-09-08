import { SearchX } from 'lucide-react';
import { IllustratedEmptyState } from '@/molecules/IllustratedEmptyState/IllustratedEmptyState';

export function ResourceEmpty({ unknown = false, error = false }: { unknown?: boolean; error?: boolean }) {
  return (
    <IllustratedEmptyState
      imageSrc="/images/tagged-empty-state.webp"
      imageAlt=""
      icon={SearchX}
      title={error ? 'Unable to load resources' : unknown ? 'Resource not found' : 'No resources yet'}
      subtitle={
        error
          ? 'The resource index is unavailable. Try again later.'
          : unknown
          ? 'This resource is unknown to the staging index.'
          : 'Resources tagged with this category will appear here.'
      }
    />
  );
}
