import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_ROUTES } from '@/app/routes';
import { MessagingController } from '@/controllers/messaging/messaging';
import { MessagingSyncCoordinator } from '@/coordinators/messaging-sync/messaging-sync';
import { MESSAGING_BACKGROUND_SYNC_INTERVAL_MS } from '@/coordinators/messaging-sync/messaging-sync.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';
import { installWebLocks, removeWebLocks } from '@/test-utils/web-locks';

const OWNER = 'o'.repeat(52);

function signIn(hasProfile = true) {
  useAuthStore.getState().init({ session: mockSession(), currentUserPubky: OWNER, hasProfile });
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

describe('MessagingSyncCoordinator', () => {
  let setUpHere: ReturnType<typeof vi.spyOn>;
  let status: ReturnType<typeof vi.spyOn>;
  let sync: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    installWebLocks();
    MessagingSyncCoordinator.resetInstance();
    useAuthStore.getState().reset();
    setUpHere = vi.spyOn(MessagingController, 'isMessagingSetUpOnThisDevice').mockResolvedValue(true);
    status = vi
      .spyOn(MessagingController, 'getMessagingStatus')
      .mockResolvedValue({ sessionActive: true, receiverProvisioned: true });
    sync = vi.spyOn(MessagingController, 'syncInbox').mockResolvedValue({ mutes: 'ready', rateLimited: 0 });
  });

  afterEach(() => {
    MessagingSyncCoordinator.resetInstance();
    removeWebLocks();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('syncs on start and then on its interval while signed in', async () => {
    signIn();
    await MessagingSyncCoordinator.getInstance().start();
    await settle();
    expect(sync).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(MESSAGING_BACKGROUND_SYNC_INTERVAL_MS);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('keeps syncing while the tab is hidden', async () => {
    signIn();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await MessagingSyncCoordinator.getInstance().start();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(MESSAGING_BACKGROUND_SYNC_INTERVAL_MS);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('runs for an account without a profile', async () => {
    signIn(false);
    await MessagingSyncCoordinator.getInstance().start();
    await settle();
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('does nothing while signed out', async () => {
    await MessagingSyncCoordinator.getInstance().start();
    await vi.advanceTimersByTimeAsync(MESSAGING_BACKGROUND_SYNC_INTERVAL_MS * 2);
    expect(setUpHere).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });

  it('stops when the account signs out', async () => {
    signIn();
    await MessagingSyncCoordinator.getInstance().start();
    await settle();
    useAuthStore.getState().reset();
    await vi.advanceTimersByTimeAsync(MESSAGING_BACKGROUND_SYNC_INTERVAL_MS * 2);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('never resumes a session or syncs where this device has no messaging key', async () => {
    signIn();
    setUpHere.mockResolvedValue(false);
    await MessagingSyncCoordinator.getInstance().start();
    await settle();
    expect(status).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });

  it('skips the pass when the session cannot resume without the signer', async () => {
    signIn();
    status.mockResolvedValue({ sessionActive: false, receiverProvisioned: true });
    await MessagingSyncCoordinator.getInstance().start();
    await settle();
    expect(sync).not.toHaveBeenCalled();
  });

  it('leaves the pass to the tab already running one', async () => {
    signIn();
    let releaseOtherTab: () => void = () => undefined;
    const otherTab = navigator.locks.request(
      `pubky-messaging-background-sync|${OWNER}`,
      () =>
        new Promise<void>((resolve) => {
          releaseOtherTab = resolve;
        }),
    );
    await MessagingSyncCoordinator.getInstance().start();
    await settle();
    expect(setUpHere).not.toHaveBeenCalled();

    releaseOtherTab();
    await otherTab;
    await vi.advanceTimersByTimeAsync(MESSAGING_BACKGROUND_SYNC_INTERVAL_MS);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('keeps its interval after a failed pass', async () => {
    signIn();
    sync.mockRejectedValueOnce(new Error('homeserver unreachable'));
    await MessagingSyncCoordinator.getInstance().start();
    await settle();
    await vi.advanceTimersByTimeAsync(MESSAGING_BACKGROUND_SYNC_INTERVAL_MS);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('does not run on the sign-in and sign-out routes', async () => {
    signIn();
    const coordinator = MessagingSyncCoordinator.getInstance();
    await coordinator.setRoute(AUTH_ROUTES.SIGN_IN);
    await coordinator.start();
    await vi.advanceTimersByTimeAsync(MESSAGING_BACKGROUND_SYNC_INTERVAL_MS);
    expect(sync).not.toHaveBeenCalled();
  });
});
