import { TagKind, type TCreateTagListInput, type TDeleteTagInput } from '@/application/tag/tag.types';
import { createTagMutationId } from '@/application/tag/tag.utils';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { isAppError } from '@/libs/error/error.utils';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import {
  buildMarketplaceTagRowId,
  LocalMarketplaceTagService,
  type MarketplaceTagKind,
} from '@/services/local/tag/marketplace/tag.marketplace';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import { ViewerTagMarkerStorage } from '@/services/local/tag/post/viewerTagMarkerStorage';
import type { TViewerTagMutationsParams } from '@/services/local/tag/tag.types';
import { LocalTagCacheService } from '@/services/local/tag/tag-cache';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';

function isMarketplaceTagKind(kind: TagKind): kind is MarketplaceTagKind {
  return kind === TagKind.LISTING || kind === TagKind.SHOP;
}

/**
 * Routes a local tag write to the service owning the target kind.
 * Marketplace targets are keyed by their kind-prefixed row id.
 */
async function applyLocalTagWrite(
  op: 'create' | 'delete',
  {
    taggedKind,
    taggedId,
    ...params
  }: TViewerTagMutationsParams & {
    label: string;
    mutationId: string;
    expectedMutationId?: string;
    synced?: boolean;
    isCurrent?: () => boolean;
  },
): Promise<boolean> {
  if (isMarketplaceTagKind(taggedKind)) {
    const rowId = buildMarketplaceTagRowId(taggedKind, taggedId);
    return op === 'create'
      ? LocalMarketplaceTagService.create({ ...params, taggedId: rowId })
      : LocalMarketplaceTagService.delete({ ...params, taggedId: rowId });
  }
  const local = taggedKind === TagKind.POST ? LocalPostTagService : LocalUserTagService;
  return op === 'create' ? local.create({ ...params, taggedId }) : local.delete({ ...params, taggedId });
}

/** Optimistic writes and conditional compensation share their operation ID in IndexedDB. */
export class TagApplication {
  static getViewerMutations({ taggedKind, taggedId, taggerId }: TViewerTagMutationsParams) {
    if (taggedKind === TagKind.POST) {
      return LocalTagCacheService.getViewerMutations({ kind: 'post', id: taggedId }, taggerId);
    }
    return LocalTagCacheService.getViewerMutations({ kind: 'user', id: taggedId }, taggerId);
  }

  static async commitCreate({ tagList, isCurrent }: TCreateTagListInput) {
    // Sequential: a failed entry leaves no hidden in-flight writes for later tags.
    for (const { taggerId, taggedId, label, tagUrl, tagJson, taggedKind } of tagList) {
      if (isCurrent && !isCurrent()) return;
      const mutationId = createTagMutationId();
      const params = { taggerId, taggedId, label, mutationId, isCurrent };
      const changed = await applyLocalTagWrite('create', { taggedKind, ...params });
      if (isCurrent && !isCurrent()) return;
      try {
        await HomeserverService.request({ method: HttpMethod.PUT, url: tagUrl, bodyJson: tagJson });
      } catch (error) {
        if (changed && (!isCurrent || isCurrent())) {
          try {
            await applyLocalTagWrite('delete', {
              taggedKind,
              ...params,
              mutationId: createTagMutationId(),
              expectedMutationId: mutationId,
              synced: true,
            });
          } catch (rollbackError) {
            if (!isAppError(rollbackError))
              Logger.error('Failed to rollback local tag create', { taggedId, label, rollbackError });
          }
        }
        throw error;
      }
      if (changed && !isMarketplaceTagKind(taggedKind))
        await LocalTagCacheService.completeMutation({ kind: taggedKind, id: taggedId }, { mutationId, isCurrent });
    }
  }

  static async commitDelete({ taggerId, taggedId, label, tagUrl, taggedKind, isCurrent }: TDeleteTagInput) {
    if (isCurrent && !isCurrent()) return;
    const mutationId = createTagMutationId();
    const params = { taggerId, taggedId, label, mutationId, isCurrent };
    const changed = await applyLocalTagWrite('delete', { taggedKind, ...params });
    if (!changed || (isCurrent && !isCurrent())) return;
    try {
      await HomeserverService.request({ method: HttpMethod.DELETE, url: tagUrl });
    } catch (error) {
      // An already absent homeserver record agrees with the optimistic deletion.
      if (!(error instanceof AppError && error.code === ClientErrorCode.NOT_FOUND)) {
        if (!isCurrent || isCurrent()) {
          try {
            await applyLocalTagWrite('create', {
              taggedKind,
              ...params,
              mutationId: createTagMutationId(),
              expectedMutationId: mutationId,
              synced: true,
            });
          } catch (rollbackError) {
            if (!isAppError(rollbackError))
              Logger.error('Failed to rollback local tag delete', { taggedId, label, rollbackError });
          }
        }
        throw error;
      }
    }
    if (!isMarketplaceTagKind(taggedKind)) {
      await LocalTagCacheService.completeMutation({ kind: taggedKind, id: taggedId }, { mutationId, isCurrent });
    }
  }

  /** Drop legacy marketplace viewer markers when an identity leaves this tab. */
  static clearViewerMarkers(pubky: Pubky): void {
    ViewerTagMarkerStorage.clearForUser(pubky);
  }
}
