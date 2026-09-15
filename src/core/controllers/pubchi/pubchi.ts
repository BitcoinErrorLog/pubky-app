import { type Capabilities, Session } from '@synonymdev/pubky';
import { PubchiApplication } from '@/application/pubchi/pubchi';
import type {
  CreatedPubchi,
  LoadedPubchi,
  PubchiBindingRecordResult,
  PubchiQuerySuccess,
} from '@/application/pubchi/pubchi.types';
import { TagKind } from '@/application/tag/tag.types';
import { TagController } from '@/controllers/tag/tag';
import { getPubchiDatabase } from '@/database/pubchi/pubchi';
import { AuthErrorCode, NetworkErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Identity } from '@/libs/identity/identity';
import { Logger } from '@/libs/logger/logger';
import { APP_SIGNIN_CAPABILITIES, sessionCovers } from '@/libs/pubchi/capabilities';
import { isPubchiEnabled, isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import { type FeedProposalV2, isPubkyId, type PubchiConfigV1, type PubchiOwnerContextV1 } from '@/libs/pubchi/schemas';
import { HomeserverService } from '@/services/homeserver/homeserver';
import type { TGenerateAuthUrlResult } from '@/services/homeserver/homeserver.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { type PubchiFlyoutPrefill, usePubchiStore } from '@/stores/pubchi/pubchi.store';
import type { TConfirmPubchiBackupParams, TCreatePubchiParams, TPubchiQueryParams } from './pubchi.types';
import { publishPubchiSync } from './pubchi-sync';

export class PubchiController {
  private constructor() {}

  static openFlyout(prefill?: Omit<PubchiFlyoutPrefill, 'ownerPubky'>): void {
    usePubchiStore.getState().openFlyout(prefill, useAuthStore.getState().currentUserPubky);
  }

  static closeFlyout(): void {
    usePubchiStore.getState().closeFlyout();
  }

  static openFeedBuilder(proposal?: FeedProposalV2): void {
    usePubchiStore.getState().openFeedBuilder(proposal);
  }

  static closeFeedBuilder(): void {
    usePubchiStore.getState().closeFeedBuilder();
  }

  static consumePrefill(ownerPubky = useAuthStore.getState().currentUserPubky): PubchiFlyoutPrefill | undefined {
    return usePubchiStore.getState().consumePrefill(ownerPubky);
  }

  static async getActiveBinding(): Promise<PubchiBindingRecordResult | undefined> {
    if (!isPubchiEnabled()) return undefined;
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    return PubchiApplication.getActiveBinding(owner);
  }

  static async createPubchi(params: TCreatePubchiParams): Promise<CreatedPubchi> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'createPubchi',
      });
    }
    const auth = useAuthStore.getState();
    const owner = auth.selectCurrentUserPubky();
    const capabilities = auth.selectSession()?.info.capabilities ?? [];
    const created = await PubchiApplication.createPubchi({ owner, displayName: params.displayName, capabilities });
    const { phrase: _omit, ...loaded } = created;
    if (useAuthStore.getState().currentUserPubky === owner) {
      usePubchiStore.getState().setPubchi(loaded, owner);
    }
    publishPubchiSync(owner, 'created');
    return created;
  }

  static async commitCreateBinding(params: { bot: string }): Promise<PubchiBindingRecordResult> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'commitCreateBinding',
      });
    }
    const bot = params.bot.trim();
    if (!isPubkyId(bot)) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
        service: ErrorService.Pubchi,
        operation: 'commitCreateBinding',
      });
    }
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const result = await PubchiApplication.commitCreateBinding({
      owner,
      bot,
    });
    publishPubchiSync(owner, 'created');
    return result;
  }

  static async loadPubchi(): Promise<LoadedPubchi | undefined> {
    if (!isPubchiEnabled()) return undefined;
    const ownerAtStart = useAuthStore.getState().currentUserPubky;
    if (!ownerAtStart) return undefined;
    const pubchi = await PubchiApplication.loadPubchi(ownerAtStart);
    if (useAuthStore.getState().currentUserPubky === ownerAtStart) {
      usePubchiStore.getState().setPubchi(pubchi, ownerAtStart);
    }
    return pubchi;
  }

  static async confirmBackup(params: TConfirmPubchiBackupParams): Promise<LoadedPubchi> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const pubchi = await PubchiApplication.confirmBackup({ owner, ...params });
    if (useAuthStore.getState().currentUserPubky === owner) {
      usePubchiStore.getState().setPubchi(pubchi, owner);
    }
    publishPubchiSync(owner, 'config-saved');
    return pubchi;
  }

  static async commitDeleteBinding(params: { bot?: string } = {}): Promise<void> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'commitDeleteBinding',
      });
    }
    const ownerAtStart = useAuthStore.getState().selectCurrentUserPubky();
    if (params.bot !== undefined && !isPubkyId(params.bot.trim())) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
        service: ErrorService.Pubchi,
        operation: 'commitDeleteBinding',
      });
    }
    const requestedBot = params.bot?.trim();
    if (requestedBot) {
      await PubchiApplication.commitDeleteBinding({ owner: ownerAtStart, bot: requestedBot });
      if (useAuthStore.getState().currentUserPubky === ownerAtStart) usePubchiStore.getState().clear();
      publishPubchiSync(ownerAtStart, 'removed');
      return;
    }
    const binding = await PubchiApplication.getActiveBinding(ownerAtStart);
    const remote = await PubchiApplication.loadPubchi(ownerAtStart);
    const bot = remote?.bot ?? binding?.bot;
    if (!bot) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_NOT_FOUND', {
        service: ErrorService.Pubchi,
        operation: 'commitDeleteBinding',
      });
    }
    await PubchiApplication.commitDeleteBinding({ owner: ownerAtStart, bot });
    if (useAuthStore.getState().currentUserPubky === ownerAtStart) usePubchiStore.getState().clear();
    publishPubchiSync(ownerAtStart, 'removed');
  }

  /**
   * Network-only query. Signs `RequestObjectV1` with the non-extractable
   * device CryptoKey and POSTs to the Pubchi API. The service never receives
   * a session or the account key.
   */
  static async fetchPubchiQuery(params: TPubchiQueryParams): Promise<PubchiQuerySuccess> {
    if (!isPubchiPanelEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'fetchPubchiQuery',
      });
    }
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const context = usePubchiStore.getState().ownerPubky === owner ? usePubchiStore.getState().context : null;
    return PubchiApplication.query({
      owner,
      question: params.question,
      purpose: params.purpose,
      ...(params.purpose === 'ask' && params.conversation?.turns.length ? { conversation: params.conversation } : {}),
      ...(params.proposalVersion ? { proposalVersion: params.proposalVersion } : {}),
      ...(params.targetFeedId ? { targetFeedId: params.targetFeedId } : {}),
      ...(params.currentFeed ? { currentFeed: params.currentFeed } : {}),
      ...(params.target ? { target: params.target } : {}),
      ...(context ? { context } : {}),
    });
  }

  static async applyTagSuggestion(
    recordId: string,
    suggestionIndex: number,
  ): Promise<'applied' | 'superseded' | 'reconciliation-pending'> {
    PubchiApplication.beginTagSuggestionOperation(recordId, suggestionIndex);
    try {
      return await this.applyTagSuggestionInternal(recordId, suggestionIndex);
    } finally {
      PubchiApplication.endTagSuggestionOperation(recordId, suggestionIndex);
    }
  }

  private static async applyTagSuggestionInternal(
    recordId: string,
    suggestionIndex: number,
  ): Promise<'applied' | 'superseded' | 'reconciliation-pending'> {
    const auth = useAuthStore.getState();
    const owner = auth.selectCurrentUserPubky();
    const prepared = await PubchiApplication.prepareTagSuggestionApplication(
      recordId,
      suggestionIndex,
      owner,
      auth.selectSession()?.info.capabilities ?? [],
    );
    const taggedKind = prepared.binding.target.kind === 'post' ? TagKind.POST : TagKind.USER;
    const matched = prepared.binding.target.uri.match(
      prepared.binding.target.kind === 'post'
        ? /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/posts\/([^/]+)$/
        : /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/profile\.json$/,
    );
    if (!matched) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Invalid tag suggestion target', {
        service: ErrorService.Pubchi,
        operation: 'applyTagSuggestion',
      });
    }
    let result;
    try {
      result = await TagController.commitCreate({
        taggedKind,
        taggedId: taggedKind === TagKind.POST ? `${matched[1]}:${matched[2]}` : matched[1],
        label: prepared.suggestion.label,
        taggerId: owner,
      });
    } catch (cause) {
      await PubchiApplication.finalizeTagSuggestionApplication(
        recordId,
        suggestionIndex,
        prepared.applicationId,
        'failed',
      );
      throw cause;
    }
    const tag = Array.isArray(result) ? result[0] : result;
    if (!tag) {
      await PubchiApplication.finalizeTagSuggestionApplication(
        recordId,
        suggestionIndex,
        prepared.applicationId,
        'failed',
      );
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Tag application did not return a result', {
        service: ErrorService.Pubchi,
        operation: 'applyTagSuggestion',
      });
    }
    const status = tag.alreadyExisted ? 'superseded' : 'applied';
    try {
      await PubchiApplication.recordTagSuggestionApplyOutcome(recordId, suggestionIndex, tag.alreadyExisted);
    } catch {
      await PubchiApplication.markTagSuggestionReconciliationPending(recordId, suggestionIndex);
      return 'reconciliation-pending';
    }
    try {
      await PubchiApplication.finalizeTagSuggestionApplication(
        recordId,
        suggestionIndex,
        prepared.applicationId,
        status,
        tag.tagUrl,
        tag.alreadyExisted,
      );
      return status;
    } catch (cause) {
      await PubchiApplication.markTagSuggestionReconciliationPending(recordId, suggestionIndex);
      throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Tag was written but receipt needs reconciliation', {
        service: ErrorService.Pubchi,
        operation: 'applyTagSuggestion',
        cause,
      });
    }
  }

  static async revertTagSuggestion(recordId: string, suggestionIndex: number): Promise<void> {
    PubchiApplication.beginTagSuggestionOperation(recordId, suggestionIndex);
    try {
      await this.revertTagSuggestionInternal(recordId, suggestionIndex);
    } finally {
      PubchiApplication.endTagSuggestionOperation(recordId, suggestionIndex);
    }
  }

  private static async revertTagSuggestionInternal(recordId: string, suggestionIndex: number): Promise<void> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const prepared = await PubchiApplication.prepareTagSuggestionRevert(recordId, suggestionIndex, owner);
    await PubchiApplication.recordTagSuggestionRevertOperation(recordId, suggestionIndex);
    const matched = prepared.binding.target.uri.match(
      prepared.binding.target.kind === 'post'
        ? /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/posts\/([^/]+)$/
        : /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/profile\.json$/,
    );
    if (!matched) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'Invalid tag suggestion target', {
        service: ErrorService.Pubchi,
        operation: 'revertTagSuggestion',
      });
    }
    const taggedKind = prepared.binding.target.kind === 'post' ? TagKind.POST : TagKind.USER;
    const tagParams = {
      taggedKind,
      taggedId: taggedKind === TagKind.POST ? `${matched[1]}:${matched[2]}` : matched[1],
      label: prepared.suggestion.label,
      taggerId: owner,
    };
    await TagController.materializeForDelete(tagParams);
    await TagController.commitDelete(tagParams);
    try {
      await PubchiApplication.finalizeTagSuggestionApplication(
        recordId,
        suggestionIndex,
        prepared.applicationId,
        'reverted',
      );
    } catch (cause) {
      await PubchiApplication.markTagSuggestionReconciliationPending(recordId, suggestionIndex);
      throw Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Tag was removed but receipt needs reconciliation', {
        service: ErrorService.Pubchi,
        operation: 'revertTagSuggestion',
        cause,
      });
    }
  }

  static async reconcileTagSuggestion(
    recordId: string,
    suggestionIndex: number,
  ): Promise<
    'proposed' | 'applying' | 'applied' | 'superseded' | 'failed' | 'reverted' | 'reconciliation-pending'
  > {
    return PubchiApplication.reconcileTagSuggestionApplication(
      recordId,
      suggestionIndex,
      useAuthStore.getState().selectCurrentUserPubky(),
    );
  }

  static async getTagSuggestionStatuses(recordId: string): Promise<Record<number, string>> {
    const record = await getPubchiDatabase().tagApplications.get(recordId);
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    if (!record || record.owner !== owner) return {};
    return PubchiApplication.rehydrateTagSuggestionStatuses(recordId, owner);
  }

  static async loadPubchiCursor(): Promise<string | null> {
    return PubchiApplication.loadPubchiCursor(useAuthStore.getState().selectCurrentUserPubky());
  }

  static async savePubchiCursor(owner: string, cursor: string): Promise<void> {
    return PubchiApplication.savePubchiCursor(owner, cursor);
  }

  static async reconcileActiveBinding(): Promise<PubchiBindingRecordResult | undefined> {
    if (!isPubchiEnabled()) return undefined;
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    return PubchiApplication.reconcileActiveBinding(owner);
  }

  static async ensureDeviceReady(): Promise<boolean> {
    if (!isPubchiEnabled()) return false;
    const ownerAtStart = useAuthStore.getState().selectCurrentUserPubky();
    const ready = await PubchiApplication.ensureDeviceReady(ownerAtStart);
    if (ready) publishPubchiSync(ownerAtStart, 'devices-changed');
    return ready;
  }

  static async listDeviceKeys() {
    if (!isPubchiEnabled()) return [];
    return PubchiApplication.listDeviceDelegations(useAuthStore.getState().selectCurrentUserPubky());
  }

  static hadDeviceListingFailures(): boolean {
    return PubchiApplication.hadDeviceListingFailures();
  }

  static async loadPubchiConfig(): Promise<PubchiConfigV1 | null> {
    const ownerAtStart = useAuthStore.getState().selectCurrentUserPubky();
    const config = await PubchiApplication.loadPubchiConfig(ownerAtStart);
    if (useAuthStore.getState().currentUserPubky === ownerAtStart) {
      usePubchiStore.getState().setConfig(config, ownerAtStart);
    }
    return config;
  }

  static async loadPubchiContext(): Promise<PubchiOwnerContextV1 | null> {
    const ownerAtStart = useAuthStore.getState().selectCurrentUserPubky();
    const context = await PubchiApplication.loadPubchiContext(ownerAtStart);
    if (useAuthStore.getState().currentUserPubky === ownerAtStart) {
      usePubchiStore.getState().setContext(context, ownerAtStart);
    }
    return context;
  }

  static async savePubchiContext(
    partial: Pick<PubchiOwnerContextV1, 'about' | 'instructions'>,
  ): Promise<PubchiOwnerContextV1> {
    const ownerAtStart = useAuthStore.getState().selectCurrentUserPubky();
    const context = await PubchiApplication.savePubchiContext(ownerAtStart, partial);
    if (useAuthStore.getState().currentUserPubky === ownerAtStart) {
      usePubchiStore.getState().setContext(context, ownerAtStart);
    }
    return context;
  }

  static async savePubchiConfig(partial: Partial<PubchiConfigV1>): Promise<PubchiConfigV1> {
    const ownerAtStart = useAuthStore.getState().selectCurrentUserPubky();
    const config = await PubchiApplication.savePubchiConfig(ownerAtStart, partial);
    const store = usePubchiStore.getState();
    if (useAuthStore.getState().currentUserPubky === ownerAtStart) {
      store.setConfig(config, ownerAtStart);
      if (store.pubchi) store.setPubchi({ ...store.pubchi, displayName: config.display_name }, ownerAtStart);
    }
    publishPubchiSync(ownerAtStart, 'config-saved');
    return config;
  }

  static async getCapabilityApprovalUrl(capabilities = APP_SIGNIN_CAPABILITIES): Promise<TGenerateAuthUrlResult> {
    return HomeserverService.generateAuthUrl(capabilities as Capabilities);
  }

  /**
   * Adopt a Ring-approved session for the already signed-in identity.
   * Does not run `initializeAuthenticatedSession` / bootstrap. A session whose
   * pubky does not match the signed-in user is signed out: its cookie has
   * already replaced the legitimate one. The capability guard preserves the
   * current app write coverage because the SDK replaces the browser cookie
   * before this method receives the session.
   * Concurrent approvals in separate tabs can resolve out of order and
   * temporarily desynchronize the store and cookie jar; the next approval or
   * sign-in repairs the state.
   */
  static async adoptCapabilityApproval(session: Session): Promise<void> {
    const authState = useAuthStore.getState();
    const expected = authState.selectCurrentUserPubky();
    const approved = Identity.z32FromSession({ session });
    if (approved !== expected) {
      try {
        await HomeserverService.logout({ session });
      } catch (error) {
        Logger.warn('Pubchi foreign capability-approval session sign-out failed', { error });
      }
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'PUBCHI_SESSION_IDENTITY_MISMATCH', {
        service: ErrorService.Pubchi,
        operation: 'adoptCapabilityApproval',
      });
    }
    const currentCoversApp = sessionCovers(authState.session?.info.capabilities ?? [], '/pub/pubky.app/');
    const approvedCoversApp = sessionCovers(session.info.capabilities ?? [], '/pub/pubky.app/');
    if (currentCoversApp && !approvedCoversApp) {
      try {
        await HomeserverService.logout({ session });
      } catch (error) {
        Logger.warn('Pubchi narrowed capability-approval session sign-out failed', { error });
      }
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'PUBCHI_SESSION_SCOPE_NARROWED', {
        service: ErrorService.Pubchi,
        operation: 'adoptCapabilityApproval',
      });
    }
    authState.setSession(session);
    if (approvedCoversApp) {
      try {
        await PubchiApplication.unpublishKnownDelegations(approved, {
          attemptRemote: true,
          includeLocalKeys: false,
        });
      } catch (error) {
        Logger.warn('Pubchi pending delegation drain after capability approval failed', { error });
      }
    }
  }

  static async revokeDevice(signer: string): Promise<void> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    if (!isPubkyId(owner) || !isPubkyId(signer)) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
        service: ErrorService.Pubchi,
        operation: 'revokeDevice',
      });
    }
    await PubchiApplication.revokeDevice(owner, signer);
    publishPubchiSync(owner, 'devices-changed');
  }

  static async revokeAllDevices(): ReturnType<typeof PubchiApplication.revokeAllDevices> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    if (!isPubkyId(owner)) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
        service: ErrorService.Pubchi,
        operation: 'revokeAllDevices',
      });
    }
    const result = await PubchiApplication.revokeAllDevices(owner);
    publishPubchiSync(owner, 'devices-changed');
    return result;
  }
}
