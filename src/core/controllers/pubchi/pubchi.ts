import { Session } from '@synonymdev/pubky';
import { PubchiApplication } from '@/application/pubchi/pubchi';
import type {
  CreatedPubchi,
  LoadedPubchi,
  PubchiBindingRecordResult,
  PubchiQuerySuccess,
} from '@/application/pubchi/pubchi.types';
import { AuthErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Identity } from '@/libs/identity/identity';
import { Logger } from '@/libs/logger/logger';
import { capabilitiesCoverPubchiWrite, PUBCHI_SIGNIN_CAPABILITIES } from '@/libs/pubchi/capabilities';
import { isPubchiEnabled, isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import { isPubkyId, type PubchiConfigV1, type PubchiOwnerContextV1 } from '@/libs/pubchi/schemas';
import { HomeserverService } from '@/services/homeserver/homeserver';
import type { TGenerateAuthUrlResult } from '@/services/homeserver/homeserver.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import type { TConfirmPubchiBackupParams, TCreatePubchiParams, TPubchiQueryParams } from './pubchi.types';
import { publishPubchiSync } from './pubchi-sync';

export class PubchiController {
  private constructor() {}

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
      ...(context ? { context } : {}),
    });
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

  static async getCapabilityApprovalUrl(): Promise<TGenerateAuthUrlResult> {
    return HomeserverService.generateAuthUrl(PUBCHI_SIGNIN_CAPABILITIES);
  }

  /**
   * Adopt a Ring-approved session for the already signed-in identity.
   * Does not run `initializeAuthenticatedSession` / bootstrap. A session whose
   * pubky does not match the signed-in user is signed out: its cookie has
   * already replaced the legitimate one. The capability guard intentionally
   * pins Pubchi write coverage only; narrowing unrelated scopes is outside it.
   * Same-identity approvals are always adopted because the SDK has already
   * replaced the browser cookie before this method receives the session.
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
    const currentCoversPubchi = capabilitiesCoverPubchiWrite(authState.session?.info.capabilities ?? []);
    const approvedCoversPubchi = capabilitiesCoverPubchiWrite(session.info.capabilities ?? []);
    if (currentCoversPubchi && !approvedCoversPubchi) {
      authState.setSession(session);
      return;
    }
    authState.setSession(session);
    if (approvedCoversPubchi) {
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
