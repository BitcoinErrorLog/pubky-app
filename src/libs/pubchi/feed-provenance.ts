import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { FeedProposalV1, FeedProposalV2 } from '@/libs/pubchi/schemas';
import { canonicalJson, sha256Hex } from '@/libs/pubchi/schemas/canonical';
import { parsePubchiFeedProvenanceV1, type PubchiFeedProvenanceV1 } from '@/libs/pubchi/schemas/feed-provenance';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { HomeserverService } from '@/services/homeserver/homeserver';

export async function recordPubchiBuiltFeed(
  owner: string,
  proposal: FeedProposalV1 | FeedProposalV2,
  feed: FeedModelSchema,
): Promise<void> {
  const record: PubchiFeedProvenanceV1 = {
    schema: 'pubchi-feed-provenance',
    version: 1,
    feed_id: feed.id,
    created_at: Math.floor(Date.now() / 1000),
    proposal_hash: await sha256Hex(canonicalJson(proposal)),
    bot: proposal.bot,
  };
  const parsed = parsePubchiFeedProvenanceV1(record);
  if (!parsed.ok) {
    throw Err.validation(ValidationErrorCode.TYPE_ERROR, parsed.code, {
      service: ErrorService.Pubchi,
      operation: 'recordPubchiBuiltFeed',
    });
  }
  await HomeserverService.request({
    method: HttpMethod.PUT,
    url: provenanceUri(owner, feed.id),
    bodyJson: parsed.value,
  });
}

export async function deletePubchiFeedProvenance(owner: string, feedId: string): Promise<void> {
  await HomeserverService.deleteIdempotent(provenanceUri(owner, feedId));
}

export async function listPubchiFeedProvenance(owner: string): Promise<PubchiFeedProvenanceV1[]> {
  const files = await HomeserverService.listAll({ baseDirectory: provenanceDirectory(owner) });
  const results = await Promise.allSettled(
    files.map(async (url) => {
      const match = url.match(/\/pubchi\.app\/feeds\/([^/]+)\.json$/);
      if (!match) return undefined;
      const parsed = parsePubchiFeedProvenanceV1(
        await HomeserverService.request<unknown>({ method: HttpMethod.GET, url }),
      );
      if (!parsed.ok || parsed.value.feed_id !== match[1]) return undefined;
      return parsed.value;
    }),
  );
  return results.flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []));
}

export function provenanceUri(owner: string, feedId: string): string {
  return `pubky://${owner}/pub/pubchi.app/feeds/${feedId}.json`;
}

export function provenanceDirectory(owner: string): string {
  return `pubky://${owner}/pub/pubchi.app/feeds/`;
}
