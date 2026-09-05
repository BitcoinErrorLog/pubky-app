import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import type { FeedProposalV1 } from '@/libs/pubchi/schemas';

const REACH: Record<string, PubkyAppFeedReach> = {
  following: PubkyAppFeedReach.Following,
  friends: PubkyAppFeedReach.Friends,
  all: PubkyAppFeedReach.All,
  wot: PubkyAppFeedReach.Wot,
  me: PubkyAppFeedReach.Me,
};

const SORT: Record<string, PubkyAppFeedSort> = {
  recent: PubkyAppFeedSort.Recent,
  popularity: PubkyAppFeedSort.Popularity,
};

const LAYOUT: Record<string, PubkyAppFeedLayout> = {
  columns: PubkyAppFeedLayout.Columns,
  wide: PubkyAppFeedLayout.Wide,
  visual: PubkyAppFeedLayout.Visual,
  list: PubkyAppFeedLayout.List,
};

const CONTENT: Record<string, PubkyAppPostKind> = {
  short: PubkyAppPostKind.Short,
  long: PubkyAppPostKind.Long,
  image: PubkyAppPostKind.Image,
  video: PubkyAppPostKind.Video,
  link: PubkyAppPostKind.Link,
  file: PubkyAppPostKind.File,
  collection: PubkyAppPostKind.Collection,
};

export function feedProposalToCreateParams(proposal: FeedProposalV1): TFeedCreateParams {
  const config = proposal.feed.feed;
  const reach = REACH[config.reach];
  const sort = SORT[config.sort];
  const layout = LAYOUT[config.layout];
  if (!reach || !sort || !layout) {
    throw new Error('FEED_SPECS_INVALID');
  }
  const content = config.content ? (CONTENT[config.content] ?? null) : null;
  return {
    name: proposal.feed.name,
    tags: config.tags ?? [],
    domain_tags: config.domain_tags ?? [],
    reach,
    sort,
    content,
    layout,
  };
}
