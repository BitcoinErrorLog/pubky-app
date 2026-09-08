import { Session } from '@synonymdev/pubky';
import { PubchiApplication } from '@/application/pubchi/pubchi';
import type { PubchiBindingRecordResult, PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import { AuthErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Identity } from '@/libs/identity/identity';
import { Logger } from '@/libs/logger/logger';
import { PUBCHI_SIGNIN_CAPABILITIES } from '@/libs/pubchi/capabilities';
import { deleteDeviceKey, getDeviceKeys } from '@/libs/pubchi/device-key';
import { isPubchiEnabled, isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import { delegationUri, isPubkyId, type PubchiConfigV1 } from '@/libs/pubchi/schemas';
import { HomeserverService } from '@/services/homeserver/homeserver';
import type { TGenerateAuthUrlResult } from '@/services/homeserver/homeserver.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { TPubchiEnrollParams, TPubchiQueryParams } from './pubchi.types';

export class PubchiController {
  private constructor() {}

  static async getActiveBinding(): Promise<PubchiBindingRecordResult | undefined> {
    if (!isPubchiEnabled()) return undefined;
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    return PubchiApplication.getActiveBinding(owner);
  }

  static async commitCreateBinding(params: TPubchiEnrollParams): Promise<PubchiBindingRecordResult> {
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
    return PubchiApplication.commitCreateBinding({ owner, bot });
  }

  static async commitDeleteBinding(): Promise<void> {
    if (!isPubchiEnabled()) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DISABLED', {
        service: ErrorService.Pubchi,
        operation: 'commitDeleteBinding',
      });
    }
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    const binding = await PubchiApplication.getActiveBinding(owner);
    if (!binding) return;
    await PubchiApplication.commitDeleteBinding({ owner, bot: binding.bot });
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
    return PubchiApplication.query({
      owner,
      question: params.question,
      purpose: params.purpose,
    });
  }

  static async reconcileActiveBinding(): Promise<PubchiBindingRecordResult | undefined> {
    if (!isPubchiEnabled()) return undefined;
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    return PubchiApplication.reconcileActiveBinding(owner);
  }

  static async listDeviceKeys() {
    if (!isPubchiEnabled()) return [];
    return await getDeviceKeys(useAuthStore.getState().selectCurrentUserPubky());
  }

  static async loadPubchiConfig(): Promise<PubchiConfigV1 | null> {
    return PubchiApplication.loadPubchiConfig(useAuthStore.getState().selectCurrentUserPubky());
  }

  static async savePubchiConfig(partial: Partial<PubchiConfigV1>): Promise<PubchiConfigV1> {
    return PubchiApplication.savePubchiConfig(useAuthStore.getState().selectCurrentUserPubky(), partial);
  }

  static async getCapabilityApprovalUrl(): Promise<TGenerateAuthUrlResult> {
    return HomeserverService.generateAuthUrl(PUBCHI_SIGNIN_CAPABILITIES);
  }

  /**
   * Adopt a Ring-approved session for the already signed-in identity.
   * Does not run `initializeAuthenticatedSession` / bootstrap. A session whose
   * pubky does not match the signed-in user is signed out: its cookie has
   * already replaced the legitimate one.
   */
  static async adoptCapabilityApproval(session: Session): Promise<void> {
    const expected = useAuthStore.getState().selectCurrentUserPubky();
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
    useAuthStore.getState().setSession(session);
  }

  static async revokeDevice(signer: string): Promise<void> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    if (!isPubkyId(owner) || !isPubkyId(signer)) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
        service: ErrorService.Pubchi,
        operation: 'revokeDevice',
      });
    }
    await HomeserverService.request({ method: HttpMethod.DELETE, url: delegationUri(owner, signer) });
    await deleteDeviceKey(owner, signer);
  }

  static async revokeAllDevices(): Promise<void> {
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    if (!isPubkyId(owner)) {
      throw Err.validation(ValidationErrorCode.FORMAT_ERROR, 'INVALID_PUBKY', {
        service: ErrorService.Pubchi,
        operation: 'revokeAllDevices',
      });
    }
    const devices = await getDeviceKeys(owner);
    for (const device of devices) {
      if (!isPubkyId(device.signer)) {
        await deleteDeviceKey(owner, device.signer);
        continue;
      }
      await HomeserverService.request({ method: HttpMethod.DELETE, url: delegationUri(owner, device.signer) });
      await deleteDeviceKey(owner, device.signer);
    }
  }
}
