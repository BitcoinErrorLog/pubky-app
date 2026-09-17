import { PubchiController } from '@/controllers/pubchi/pubchi';
import { Logger } from '@/libs/logger/logger';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';

export class PubchiCoordinator {
  private static instance: PubchiCoordinator | null = null;

  private authStoreUnsubscribe: (() => void) | null = null;
  private isStarted = false;
  private loadedOwner: Pubky | null = null;
  private loadingOwner: Pubky | null = null;

  private constructor() {
    this.authStoreUnsubscribe = useAuthStore.subscribe((state, prevState) => {
      if (state.currentUserPubky !== prevState.currentUserPubky) {
        if (!state.currentUserPubky) {
          this.loadedOwner = null;
        }
        this.loadForCurrentOwner();
      }
    });
  }

  public static getInstance(): PubchiCoordinator {
    if (!PubchiCoordinator.instance) {
      PubchiCoordinator.instance = new PubchiCoordinator();
    }
    return PubchiCoordinator.instance;
  }

  public static resetInstance(): void {
    PubchiCoordinator.instance?.destroy();
    PubchiCoordinator.instance = null;
  }

  public start(): void {
    this.isStarted = true;
    this.loadForCurrentOwner();
  }

  public stop(): void {
    this.isStarted = false;
  }

  public destroy(): void {
    this.stop();
    this.authStoreUnsubscribe?.();
    this.authStoreUnsubscribe = null;
  }

  private loadForCurrentOwner(): void {
    if (!this.isStarted || !isPubchiEnabled()) return;

    const owner = useAuthStore.getState().currentUserPubky;
    if (!owner || owner === this.loadedOwner || owner === this.loadingOwner) return;

    this.loadingOwner = owner;
    void PubchiController.loadPubchi()
      .then(() => {
        if (useAuthStore.getState().currentUserPubky === owner) {
          this.loadedOwner = owner;
        }
      })
      .catch((error) => {
        Logger.warn('Pubchi bootstrap load failed', { error, owner });
      })
      .finally(() => {
        if (this.loadingOwner === owner) {
          this.loadingOwner = null;
        }
      });
  }
}
