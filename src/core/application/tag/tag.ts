import {
  TagKind,
  type TCreateTagListInput,
  type TCreateTagResult,
  type TDeleteTagInput,
} from '@/application/tag/tag.types';
import type { TTagEventParams } from '@/controllers/tag/tag.types';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpStatusCode } from '@/libs/http/http.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import { ViewerTagMarkerStorage } from '@/services/local/tag/post/viewerTagMarkerStorage';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';

/**
 * Tag application service implementing local-first architecture with rollback.
 *
 * **Local-First Write Pattern:**
 * Both `create` and `delete` methods update the local IndexedDB first, then
 * synchronize with the homeserver. This keeps the UI responsive while still
 * compensating locally if the homeserver request fails.
 *
 * **Failure Handling:**
 * If the homeserver request fails after the local update, the failed write is
 * rolled back locally so counters and relationship state stay consistent with
 * Nexus.
 */
export class TagApplication {
  /**
   * Commits the create tag operation to the homeserver and local database.
   * @param tagList - The list of tags to create
   */
  static async commitCreate({
    tagList,
  }: TCreateTagListInput): Promise<TCreateTagResult | TCreateTagResult[] | undefined> {
    const results: TCreateTagResult[] = [];
    // Process tags one at a time so callers never observe hidden in-flight work
    // from later entries after an earlier tag fails.
    for (const { taggerId, taggedId, label, tagUrl, tagJson, taggedKind } of tagList) {
      let didCreateLocally = false;

      if (taggedKind === TagKind.POST) {
        didCreateLocally = await LocalPostTagService.create({ taggerId, taggedId, label });
      } else {
        didCreateLocally = await LocalUserTagService.create({ taggerId, taggedId, label });
      }

      try {
        let alreadyExisted = false;
        let bodyToWrite = tagJson;
        try {
          const raw = await HomeserverService.requestRawText(tagUrl);
          if (new TextEncoder().encode(raw).byteLength > 64 * 1024) {
            throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag document is too large', {
              service: ErrorService.Homeserver,
              operation: 'commitCreate',
            });
          }
          const remote = JSON.parse(raw) as Record<string, unknown>;
          if (!remote || Array.isArray(remote) || typeof remote !== 'object')
            throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Tag document is invalid', {
              service: ErrorService.Homeserver,
              operation: 'commitCreate',
            });
          if (remote.uri !== tagJson.uri || remote.label !== tagJson.label) {
            throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag identity mismatch', {
              service: ErrorService.Homeserver,
              operation: 'commitCreate',
            });
          }
          const immutableKeys = ['uri', 'label', 'created_at'];
          const extensions = Object.fromEntries(
            Object.entries(remote).filter(([key]) => !immutableKeys.includes(key)),
          );
          bodyToWrite = { ...tagJson, created_at: remote.created_at, ...extensions };
          alreadyExisted = true;
        } catch (readError) {
          if (!hasHttpStatus(readError, HttpStatusCode.NOT_FOUND)) throw readError;
        }
        await HomeserverService.request({ method: HttpMethod.PUT, url: tagUrl, bodyJson: bodyToWrite });
        results.push({ tagUrl, alreadyExisted });
      } catch (error) {
        if (didCreateLocally) {
          try {
            if (taggedKind === TagKind.POST) {
              await LocalPostTagService.delete({ taggerId, taggedId, label });
            } else {
              await LocalUserTagService.delete({ taggerId, taggedId, label });
            }
          } catch (rollbackError) {
            Logger.error('[TagApplication.commitCreate] Failed to rollback local tag create', {
              taggedId,
              label,
              taggerId,
              taggedKind,
              rollbackError,
            });
          }
        }

        throw error;
      }
    }
    return results.length === 1 ? results[0] : results;
  }

  /**
   * Commits the delete tag operation to the homeserver and local database.
   * @param params - The parameters object
   * @param params.taggerId - The ID of the user who is deleting the tag
   * @param params.taggedId - The ID of the post or user who is being tagged
   * @param params.label - The label of the tag
   * @param params.tagUrl - The URL of the tag
   * @param params.taggedKind - The kind of the tagged entity
   */
  static async commitDelete({ taggerId, taggedId, label, tagUrl, taggedKind }: TDeleteTagInput) {
    let wasDeleted = false;

    if (taggedKind === TagKind.POST) {
      wasDeleted = await LocalPostTagService.delete({ taggerId, taggedId, label });
    } else {
      wasDeleted = await LocalUserTagService.delete({ taggerId, taggedId, label });
    }

    // Only send to homeserver if something was actually deleted locally
    if (wasDeleted) {
      try {
        await HomeserverService.request({ method: HttpMethod.DELETE, url: tagUrl });
      } catch (error) {
        // 404 means the tag is already gone on the homeserver. Local just made the
        // same change, so the two states match — accept the delete and skip rollback.
        // Without this, the rollback re-creates the tag locally and the user is left
        // with a "ghost" tag they can't remove (HS keeps returning 404).
        if (error instanceof AppError && error.code === ClientErrorCode.NOT_FOUND) {
          Logger.warn('[TagApplication.commitDelete] Homeserver returned 404; treating as already deleted', {
            taggedId,
            label,
            taggerId,
            taggedKind,
          });
          return;
        }

        try {
          if (taggedKind === TagKind.POST) {
            await LocalPostTagService.create({ taggerId, taggedId, label });
          } else {
            await LocalUserTagService.create({ taggerId, taggedId, label });
          }
        } catch (rollbackError) {
          Logger.error('[TagApplication.commitDelete] Failed to rollback local tag delete', {
            taggedId,
            label,
            taggerId,
            taggedKind,
            rollbackError,
          });
        }

        throw error;
      }
    }
  }

  static async materializeForDelete({ taggerId, taggedId, label, taggedKind }: TTagEventParams): Promise<void> {
    if (taggedKind === TagKind.POST) {
      await LocalPostTagService.create({ taggerId, taggedId, label });
    } else {
      await LocalUserTagService.create({ taggerId, taggedId, label });
    }
  }

  /**
   * Clears all viewer-mutation tag markers (sessionStorage) for the given user.
   * Called from logout / session-cleanup paths to drop stale markers before the
   * next user signs in on the same tab.
   */
  static clearViewerMarkers(pubky: Pubky) {
    ViewerTagMarkerStorage.clearForUser(pubky);
  }
}
