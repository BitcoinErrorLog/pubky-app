import { describe, expect, it, vi } from 'vitest';
import type { FeedProposalV2 } from '@/libs/pubchi/schemas';
import { PubchiFeedBuilder } from '@/organisms/Pubchi/PubchiFeedBuilder/PubchiFeedBuilder';
import { renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const BOT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const proposal = (
  reach: FeedProposalV2['feed']['feed']['reach'],
  unmapped: FeedProposalV2['mapping']['unmapped'] = [],
): FeedProposalV2 => ({
  schema: 'pubchi-feed-proposal',
  version: 2,
  bot: BOT,
  owner: BOT,
  generated_at: 1,
  mode: 'create',
  target_feed_id: null,
  feed: {
    name: 'Bitcoin builders',
    icon: 'rss',
    feed: {
      tags: ['bitcoin'],
      domain_tags: ['builders'],
      reach,
      layout: 'columns',
      sort: 'recent',
      content: 'short',
    },
  },
  mapping: { status: unmapped.length > 0 ? 'adjusted' : 'exact', unmapped },
  warnings: [],
  installed_user_feed_id: null,
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: BOT }),
}));

vi.mock('@/application/stream/posts/post', () => ({
  PostStreamApplication: { getLocalStream: vi.fn().mockResolvedValue({ stream: ['post-a', 'post-b'] }) },
}));

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: { commitCreate: vi.fn(), commitUpdate: vi.fn() },
}));

vi.mock('@/libs/pubchi/feed-provenance', () => ({
  recordPubchiBuiltFeed: vi.fn(),
}));

describe('PubchiFeedBuilder — visual regression', () => {
  it('guards and captures a pre-filled production builder', async () => {
    const screen = await renderForVRT(
      <PubchiFeedBuilder
        proposal={proposal('following')}
        open
        onOpenChange={() => undefined}
        onInterpret={async () => undefined}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    const surface = screen.getByTestId('pubchi-feed-builder');
    await expect.element(surface).toHaveAttribute('data-surface', 'pubchi-feed-builder');
    await expect.element(surface).toBeVisible();
    await expect.element(screen.getByTestId('feed-name-input')).toHaveValue('Bitcoin builders');
    await expect.element(surface).toMatchScreenshot('pubchi-feed-builder-prefilled');
  });

  it('captures the blocked followers proposal with unmapped likes notice', async () => {
    const screen = await renderForVRT(
      <PubchiFeedBuilder
        proposal={proposal('followers', [
          {
            request: 'likes',
            reason: 'likes_unavailable',
            suggestion: "Feeds can't filter by likes because Pubky doesn't model likes; closest: Popularity or Recent",
          },
        ])}
        open
        onOpenChange={() => undefined}
        onInterpret={async () => undefined}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    const surface = screen.getByTestId('pubchi-feed-builder');
    await expect.element(surface).toHaveAttribute('data-surface', 'pubchi-feed-builder');
    await expect.element(surface).toBeVisible();
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Followers was requested but is not available');
    await expect.element(screen.getByTestId('save-feed-button')).toBeDisabled();
    await expect.element(surface).toMatchScreenshot('pubchi-feed-builder-blocked');
  });
});
