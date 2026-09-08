import { SearchX } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { IllustratedEmptyState } from '@/molecules/IllustratedEmptyState/IllustratedEmptyState';

export function ResourceEmpty({ unknown = false, error = false }: { unknown?: boolean; error?: boolean }) {
  if (error) {
    return (
      <Container className="relative flex flex-col items-center justify-center gap-6 p-6">
        <Container
          overrideDefaults={true}
          className="relative z-10 flex shrink-0 items-center justify-center rounded-full bg-brand/16 p-6"
        >
          <SearchX className="size-12 text-brand" strokeWidth={1.5} />
        </Container>
        <Container overrideDefaults={true} className="relative z-10 flex w-full flex-col items-center justify-center">
          <Typography as="h3" size="lg" className="pb-6 text-center leading-8">
            Unable to load resources
          </Typography>
          <Typography as="p" className="text-center text-base leading-6 font-medium text-secondary-foreground">
            The resource index is unavailable. Try again later.
          </Typography>
        </Container>
      </Container>
    );
  }

  return (
    <IllustratedEmptyState
      imageSrc="/images/tagged-empty-state.webp"
      imageAlt=""
      icon={SearchX}
      title={unknown ? 'Resource not found' : 'No resources yet'}
      subtitle={
        unknown
          ? 'This resource is unknown to the staging index.'
          : 'Resources tagged with this category will appear here.'
      }
    />
  );
}
