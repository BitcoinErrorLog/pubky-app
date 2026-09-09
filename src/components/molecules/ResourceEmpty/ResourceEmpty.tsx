import { SearchX } from 'lucide-react';
import { IllustratedEmptyState } from '@/molecules/IllustratedEmptyState/IllustratedEmptyState';

export function ResourceEmpty({
  unknown = false,
  error = false,
  lookup = false,
}: {
  unknown?: boolean;
  error?: boolean;
  lookup?: boolean;
}) {
  if (error) {
    return (
      <IllustratedEmptyState
        icon={SearchX}
        title="Unable to load resources"
        subtitle="The resource index is unavailable. Try again later."
      />
    );
  }

  return (
    <IllustratedEmptyState
      imageSrc="/images/tagged-empty-state.webp"
      imageAlt=""
      icon={SearchX}
      title={lookup ? 'No tags yet for this link' : unknown ? 'Resource not found' : 'No resources yet'}
      subtitle={
        lookup
          ? 'This link has not been tagged in the resource index.'
          : unknown
            ? 'This resource is unknown to the staging index.'
            : 'Resources tagged with this category will appear here.'
      }
    />
  );
}
