'use client';

import { TagKind } from '@/application/tag/tag.types';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useEnrichedTags } from '@/hooks/useEnrichedTags/useEnrichedTags';
import { type MarketplaceTagTarget, useMarketplaceTags } from '@/hooks/useMarketplaceTags/useMarketplaceTags';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { TaggedList } from '@/molecules/TaggedList/TaggedList';
import { TagInput } from '@/molecules/TagInput/TagInput';
import { useAuthStore } from '@/stores/auth/auth.store';

export interface MarketplaceCommunityTagsProps {
  target: MarketplaceTagTarget;
}

/**
 * Community tag section for a marketplace listing or shop.
 *
 * Reuses the post/user tagging building blocks (`TagInput` + `TaggedList`)
 * and the same controller flow: tags are real `PubkyAppTag` records written
 * to the tagger's homeserver targeting the canonical listing/shop URI.
 *
 * Read honesty: the viewer's own tags render immediately from the local
 * write-through; aggregates from other users appear only once the marketplace
 * Nexus serves tag aggregation for these targets. Until then the panel shows
 * exactly the local tags — never fabricated counts.
 *
 * This is the community layer, deliberately separate from the seller-declared
 * keywords in the listing record (`record.tags`), which stay labeled as the
 * seller's own metadata.
 */
export function MarketplaceCommunityTags({ target }: MarketplaceCommunityTagsProps) {
  const { tags, handleTagAdd, handleTagToggle } = useMarketplaceTags(target);
  const { enrichedTags } = useEnrichedTags(tags);
  const { isAuthenticated, requireAuth } = useRequireAuth();
  const setShowSignInDialog = useAuthStore((state) => state.setShowSignInDialog);

  const handleTagToggleWithAuth = (tag: Parameters<typeof handleTagToggle>[0]) => {
    requireAuth(() => handleTagToggle(tag));
  };

  const handleTagAddWithAuth = (label: string) => {
    return requireAuth(() => handleTagAdd(label));
  };

  const handleInputClick = !isAuthenticated ? () => setShowSignInDialog(true) : undefined;

  const viewerTags = tags.filter((t) => t.relationship);
  const taggedId = target.kind === TagKind.LISTING ? `${target.sellerPubky}:${target.listingId}` : target.ownerPubky;

  return (
    <Container overrideDefaults data-cy="marketplace-community-tags" className="flex w-full flex-col gap-2">
      <Typography as="p" className="text-sm font-semibold">
        Community tags
      </Typography>
      <Typography as="p" overrideDefaults className="text-xs text-muted-foreground">
        Added by anyone on Pubky — separate from the seller&apos;s own keywords.
      </Typography>
      <TagInput
        onTagAdd={handleTagAddWithAuth}
        existingTags={tags}
        viewerTags={viewerTags}
        disabled={!isAuthenticated}
        onClick={handleInputClick}
      />
      {tags.length > 0 && (
        <Container overrideDefaults className="max-h-80 overflow-x-hidden overflow-y-auto pr-1">
          <TaggedList
            tags={enrichedTags}
            taggedId={taggedId}
            taggedKind={target.kind}
            onTagToggle={handleTagToggleWithAuth}
          />
        </Container>
      )}
    </Container>
  );
}
