import { PubchiApplication } from '@/application/pubchi/pubchi';
import type { PubchiBindingRecordResult, PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isPubchiEnabled, isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import { isPubkyId } from '@/libs/pubchi/schemas';
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
   * Network-only query. Signs `RequestObjectV1` with the user's Ed25519 seed
   * (`Keypair.secret()` / `Identity.keypairFromSecretKey`) and POSTs to the
   * Pubchi API. The service never receives a session or key.
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
      secretSeed: params.secretSeed,
    });
  }

  static async reconcileActiveBinding(): Promise<PubchiBindingRecordResult | undefined> {
    if (!isPubchiEnabled()) return undefined;
    const owner = useAuthStore.getState().selectCurrentUserPubky();
    return PubchiApplication.reconcileActiveBinding(owner);
  }
}
