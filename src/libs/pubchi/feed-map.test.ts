import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import { describe, expect, it } from 'vitest';
import { feedProposalToCreateParams } from './feed-map';
import type { FeedProposalV1 } from './schemas';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

function proposal(reach: string, sort: string, layout: 'columns' | 'wide' | 'visual' | 'list'): FeedProposalV1 {
  return {
    schema: 'pubchi-feed-proposal',
    version: 1,
    bot: OWNER,
    owner: OWNER,
    generated_at: 10,
    feed: {
      name: 'Builders',
      created_at: 10,
      feed: { tags: ['builder'], reach, layout, sort },
    },
    warnings: [],
    installed_user_feed_id: null,
  };
}

describe('feedProposalToCreateParams', () => {
  it('maps following/recent/columns even when those enums are 0', () => {
    const params = feedProposalToCreateParams(proposal('following', 'recent', 'columns'));
    expect(params.reach).toBe(PubkyAppFeedReach.Following);
    expect(params.sort).toBe(PubkyAppFeedSort.Recent);
    expect(params.layout).toBe(PubkyAppFeedLayout.Columns);
    expect(params.name).toBe('Builders');
    expect(params.tags).toEqual(['builder']);
  });

  it('rejects an unknown reach', () => {
    expect(() => feedProposalToCreateParams(proposal('likes', 'recent', 'columns'))).toThrow('FEED_SPECS_INVALID');
  });
});
