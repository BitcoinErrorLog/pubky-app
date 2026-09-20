import type { TBootstrapParams } from '@/application/bootstrap/bootstrap.types';
import { FeedApplication } from '@/application/feed/feed';
import { FileApplication } from '@/application/file/file';
import { MuteApplication } from '@/application/mute/mute';
import { NotificationApplication } from '@/application/notification/notification';
import { UserApplication } from '@/application/user/user';
import { getModerationId } from '@/config/moderation';
import { TtlCoordinator } from '@/coordinators/ttl/ttl';
import { hasHttpStatus, isAppError } from '@/libs/error/error.utils';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { getTtlRetryDelayMs } from '@/libs/runtime-config/runtime-config';
import { buildHotTagsId } from '@/models/hot/hot.helper';
import type { NotificationType } from '@/models/notification/notification.types';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { TagStreamTypes } from '@/models/stream/tag/tagStream.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { LastReadNormalizer } from '@/pipes/lastRead/lastRead.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalHotService } from '@/services/local/hot/hot';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamTagsService } from '@/services/local/stream/tags/tags';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { LocalUserService } from '@/services/local/user/user';
import { NexusBootstrapService } from '@/services/nexus/bootstrap/bootstrap';
import { UserStreamTimeframe } from '@/services/nexus/nexus.types';
import { getNexusResponseStartedAt } from '@/services/nexus/nexus.utils';
import type { NotificationState } from '@/stores/notification/notification.types';

/**
 * Callback type for reporting bootstrap progress to the Controller layer.
 * This allows the Controller to update stores without violating architecture rules.
 */
export type BootstrapProgressCallback = (step: 'bootstrapFetched' | 'dataPersisted' | 'homeserverSynced') => void;

export class BootstrapApplication {
  private static moderationFollowAbortController: AbortController | null = null;

  private constructor() {}

  static cancelModerationFollow(): void {
    this.moderationFollowAbortController?.abort();
    this.moderationFollowAbortController = null;
  }

  private static clearModerationFollowController(controller: AbortController): void {
    if (this.moderationFollowAbortController === controller) {
      this.moderationFollowAbortController = null;
    }
  }

  /**
   * Initialize application state from Nexus and notifications in parallel.
   *
   * @param params, Bootstrap parameters
   * @param params.pubky, The user's public key identifier
   * @param params.lastReadUrl, URL to fetch user's last read timestamp from homeserver
   * @param onProgress, Optional callback to report progress to the Controller layer
   * @returns Promise resolving to notification state with preference-filtered unread count.
   *          Only the social (Nexus-backed) fields: the marketplace unread count is owned
   *          by the commerce badge poll, so bootstrap never touches it.
   */
  static async initialize(
    params: TBootstrapParams & { allowedTypes: NotificationType[] },
    onProgress?: BootstrapProgressCallback,
  ): Promise<Omit<NotificationState, 'marketplaceUnread'>> {
    const pubky = params.pubky;
    const [bootstrapData, userLastRead] = await Promise.all([
      NexusBootstrapService.fetch(pubky),
      this.fetchOrPutLastRead(params),
      MuteApplication.fetchMutedUsers(pubky), // fetches and persists MUTED stream internally
      FeedApplication.fetchFeeds(pubky),
    ]);
    if (params.isCurrent && !params.isCurrent()) {
      return { unread: 0, lastRead: userLastRead, lastPolledTimestamp: undefined };
    }
    onProgress?.('bootstrapFetched'); // Step 3 complete (60%)

    if (!bootstrapData.indexed) {
      // Tell Nexus this user exists (best-effort, never rejects; see NexusBootstrapService.ingest).
      void NexusBootstrapService.ingest(pubky);

      const retryDelayMs = getTtlRetryDelayMs();
      Logger.warn('User is not indexed in Nexus. Scheduling TTL retry', {
        pubky,
        retryDelayMs,
      });

      // Write TTL record to become stale after configured retry delay
      await LocalUserService.upsertTtlWithDelay(pubky, retryDelayMs);

      // Subscribe to TTL coordinator for periodic staleness checks
      TtlCoordinator.getInstance().retryUserIndexing({ pubky });
    }

    const [{ unread, nextPollCursor }] = await Promise.all([
      NotificationApplication.persistAndSummarize({
        notifications: bootstrapData.notifications,
        isCurrent: params.isCurrent,
        lastRead: userLastRead,
        allowedTypes: params.allowedTypes,
      }),
      LocalStreamUsersService.persistUsers(bootstrapData.users, {
        revisions: new Map(),
        viewerId: pubky,
        isCurrent: params.isCurrent,
        validatedAt: getNexusResponseStartedAt(bootstrapData),
      }),
      LocalStreamPostsService.persistPosts({
        posts: bootstrapData.posts,
        tagGuard: {
          revisions: new Map(),
          viewerId: pubky,
          isCurrent: params.isCurrent,
          validatedAt: getNexusResponseStartedAt(bootstrapData),
        },
      }),
      LocalStreamPostsService.upsert({
        streamId: PostStreamTypes.TIMELINE_ALL_ALL,
        stream: bootstrapData.ids.stream,
      }),
      // The bootstrap page is the stream head now; ids an earlier head poll collected are
      // at or below it, and merging them on top would put them above newer posts.
      LocalStreamPostsService.clearUnreadStream({ streamId: PostStreamTypes.TIMELINE_ALL_ALL }),
      LocalStreamUsersService.upsert({
        streamId: UserStreamTypes.TODAY_INFLUENCERS_ALL,
        stream: bootstrapData.ids.influencers,
      }),
      LocalStreamUsersService.upsert({
        streamId: UserStreamTypes.RECOMMENDED,
        stream: bootstrapData.ids.recommended,
      }),
      FileApplication.persistFiles(bootstrapData.files),
      LocalHotService.upsert(buildHotTagsId(UserStreamTimeframe.TODAY, 'all'), bootstrapData.ids.hot_tags),
      LocalStreamTagsService.upsert(TagStreamTypes.TODAY_ALL, bootstrapData.ids.hot_tags),
    ]);
    onProgress?.('dataPersisted'); // Step 4 complete (80%)
    this.cancelModerationFollow();
    const moderationFollowController = new AbortController();
    this.moderationFollowAbortController = moderationFollowController;
    void this.ensureModerationFollow(pubky, moderationFollowController);
    // TODO: We will not have that step, but we will add HomeserverSignIn step before step 1 to catch errors
    onProgress?.('homeserverSynced'); // Step 5 complete (100%)

    return { unread, lastRead: userLastRead, lastPolledTimestamp: nextPollCursor };
  }

  private static async ensureModerationFollow(pubky: string, controller: AbortController): Promise<void> {
    try {
      await UserApplication.ensureModerationFollow({
        follower: pubky,
        moderationId: getModerationId(),
        signal: controller.signal,
      });
    } catch (error) {
      if (!controller.signal.aborted && !isAppError(error)) {
        Logger.warn('Unexpected moderation-follow bootstrap failure', { error });
      }
    } finally {
      this.clearModerationFollowController(controller);
    }
  }

  /**
   * Retrieves user's last read timestamp from homeserver, fetches notification data from Nexus
   * and persists the notifications to the cache.
   *
   * @private
   * @param params, Bootstrap parameters
   * @param params.pubky, The user's public key identifier
   * @param params.lastReadUrl, URL to fetch user's last read timestamp from homeserver
   * @returns Promise resolving to notification list and last read timestamp
   */
  private static async fetchOrPutLastRead({ pubky, lastReadUrl }: TBootstrapParams): Promise<number> {
    try {
      const { timestamp } = await HomeserverService.request<{ timestamp: number }>({
        method: HttpMethod.GET,
        url: lastReadUrl,
      });
      return timestamp;
    } catch (error) {
      // Only handle 404 errors (resource not found), rethrow everything else
      if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) {
        Logger.info('Last read file not found, creating new one...', { pubky });
        const lastRead = LastReadNormalizer.to(pubky);
        void HomeserverService.request({
          method: HttpMethod.PUT,
          url: lastRead.meta.url,
          bodyJson: lastRead.last_read.toJson(),
        });
        return Number(lastRead.last_read.timestamp);
      } else {
        // Network errors, timeouts, server errors, etc. should bubble up
        Logger.error('Failed to fetch last read timestamp', error);
        // TODO: TO harsh, we should handle this error better
        throw error;
      }
    }
  }
}
