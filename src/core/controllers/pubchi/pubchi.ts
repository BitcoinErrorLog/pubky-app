import { PubchiApplication } from '@/application/pubchi/pubchi';
import type { PubchiBindingRecordResult, PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { deleteDeviceKey, getDeviceKeys } from '@/libs/pubchi/device-key';
import { isPubchiEnabled, isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import { isPubkyId } from '@/libs/pubchi/schemas';
import { delegationUri } from '@/libs/pubchi/schemas';
import { HomeserverService } from '@/services/homeserver/homeserver';
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

  static async getCapabilityApprovalUrl(): Promise<string> {
    const { authorizationUrl } = await HomeserverService.generateAuthUrl('/pub/pubky.app/:rw,/pub/pubchi.app/:rw');
    return authorizationUrl;
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
