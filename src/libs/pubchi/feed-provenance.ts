import { getPubchiDatabase } from '@/database/pubchi/pubchi';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { pubchiFeedProvenanceId, type PubchiFeedProvenanceRecord } from '@/models/pubchi/feed-provenance.schema';

export async function markFeedAsPubchiBuilt(owner: string, feed: FeedModelSchema): Promise<void> {
  const record: PubchiFeedProvenanceRecord = {
    id: pubchiFeedProvenanceId(owner, feed.id),
    owner,
    feedId: feed.id,
    createdAt: feed.created_at,
  };
  await getPubchiDatabase().feedProvenance.put(record);
}

export async function getPubchiBuiltFeedIds(owner: string): Promise<Set<string>> {
  const records = await getPubchiDatabase().feedProvenance.where('owner').equals(owner).toArray();
  return new Set(records.map(({ feedId }) => feedId));
}
