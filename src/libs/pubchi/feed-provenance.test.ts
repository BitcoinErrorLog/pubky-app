import { Keypair } from '@synonymdev/pubky';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpMethod } from '@/libs/http/http.types';
import type { FeedProposalV1 } from '@/libs/pubchi/schemas';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { listPubchiFeedProvenance, recordPubchiBuiltFeed } from './feed-provenance';

const OWNER = Keypair.random().publicKey.z32();
const BOT = OWNER;
const FEED: FeedModelSchema = {
  id: 'feed-1',
  name: 'Builders',
  tags: ['builders'],
  domain_tags: [],
  reach: PubkyAppFeedReach.Following,
  sort: PubkyAppFeedSort.Recent,
  content: null,
  layout: PubkyAppFeedLayout.Columns,
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_000_000,
};
const PROPOSAL: FeedProposalV1 = {
  schema: 'pubchi-feed-proposal',
  version: 1,
  bot: BOT,
  owner: OWNER,
  generated_at: 1_700_000_000,
  feed: {
    name: 'Builders',
    created_at: 1_700_000_000,
    feed: { tags: ['builders'], reach: 'following', layout: 'columns', sort: 'recent' },
  },
  warnings: [],
  installed_user_feed_id: null,
};

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    request: vi.fn(),
    listAll: vi.fn(),
  },
}));

describe('Pubchi feed provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a strict homeserver record', async () => {
    vi.mocked(HomeserverService.request).mockResolvedValue(undefined);

    await recordPubchiBuiltFeed(OWNER, PROPOSAL, FEED);

    expect(HomeserverService.request).toHaveBeenCalledWith({
      method: HttpMethod.PUT,
      url: `pubky://${OWNER}/pub/pubchi.app/feeds/${FEED.id}.json`,
      bodyJson: expect.objectContaining({
        schema: 'pubchi-feed-provenance',
        version: 1,
        feed_id: FEED.id,
        bot: BOT,
        proposal_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    });
  });

  it('lists only valid provenance records and ignores missing feeds at the join boundary', async () => {
    const recordUrl = `pubky://${OWNER}/pub/pubchi.app/feeds/${FEED.id}.json`;
    vi.mocked(HomeserverService.listAll).mockResolvedValue([
      recordUrl,
      `pubky://${OWNER}/pub/pubchi.app/feeds/missing.json`,
    ]);
    vi.mocked(HomeserverService.request)
      .mockResolvedValueOnce({
        schema: 'pubchi-feed-provenance',
        version: 1,
        feed_id: FEED.id,
        created_at: 1_700_000_000,
        proposal_hash: 'a'.repeat(64),
        bot: BOT,
      })
      .mockRejectedValueOnce(new Error('feed was deleted'));

    await expect(listPubchiFeedProvenance(OWNER)).resolves.toEqual([expect.objectContaining({ feed_id: FEED.id })]);
  });
});
